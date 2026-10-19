"""Unit tests for ratelimit.py.

Run from the backend/ directory:

    python -m unittest discover -s tests -v

No third-party packages needed — the module under test is pure stdlib, and
time is an injected fake clock, so every window boundary is exact and nothing
sleeps.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ratelimit import DAY, MINUTE, RateLimiter, resolve_client_ip  # noqa: E402


class FakeClock:
    def __init__(self, start: float = 1_000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make(per_minute=3, per_day=10, global_per_day=100):
    clock = FakeClock()
    return RateLimiter(per_minute, per_day, global_per_day, clock=clock), clock


class PerMinute(unittest.TestCase):
    def test_allows_up_to_the_limit_then_blocks(self):
        rl, _ = make(per_minute=3)
        self.assertTrue(all(rl.check("a").allowed for _ in range(3)))
        d = rl.check("a")
        self.assertFalse(d.allowed)
        self.assertEqual(d.scope, "minute")

    def test_retry_after_is_time_until_a_slot_frees(self):
        rl, clock = make(per_minute=3)
        rl.check("a")            # t=0
        clock.advance(10)
        rl.check("a")            # t=10
        rl.check("a")            # t=10
        clock.advance(5)         # t=15; the t=0 hit frees at t=60
        d = rl.check("a")
        self.assertFalse(d.allowed)
        self.assertEqual(d.retry_after, 45)

    def test_window_slides_rather_than_resetting_on_a_boundary(self):
        rl, clock = make(per_minute=2)
        rl.check("a")            # t=0
        clock.advance(30)
        rl.check("a")            # t=30
        clock.advance(31)        # t=61: the t=0 hit has aged out, t=30 has not
        self.assertTrue(rl.check("a").allowed)    # one slot free
        self.assertFalse(rl.check("a").allowed)   # t=30 and t=61 are both live

    def test_clients_are_independent(self):
        rl, _ = make(per_minute=1)
        self.assertTrue(rl.check("a").allowed)
        self.assertFalse(rl.check("a").allowed)
        self.assertTrue(rl.check("b").allowed)

    def test_exact_boundary(self):
        rl, clock = make(per_minute=1)
        rl.check("a")
        clock.advance(MINUTE - 0.001)
        self.assertFalse(rl.check("a").allowed)
        clock.advance(0.002)
        self.assertTrue(rl.check("a").allowed)


class PerDay(unittest.TestCase):
    def test_blocks_after_daily_limit_and_reports_a_long_wait(self):
        rl, clock = make(per_minute=100, per_day=4)
        for _ in range(4):
            self.assertTrue(rl.check("a").allowed)
            clock.advance(1)
        d = rl.check("a")
        self.assertFalse(d.allowed)
        self.assertEqual(d.scope, "day")
        # Oldest hit was 4s ago, so it frees in a day minus 4s.
        self.assertEqual(d.retry_after, int(DAY) - 4)

    def test_day_wins_when_both_limits_trip(self):
        rl, _ = make(per_minute=2, per_day=2)
        rl.check("a")
        rl.check("a")
        self.assertEqual(rl.check("a").scope, "day")

    def test_quota_returns_after_a_day(self):
        rl, clock = make(per_minute=100, per_day=2)
        rl.check("a")
        rl.check("a")
        self.assertFalse(rl.check("a").allowed)
        clock.advance(DAY + 1)
        self.assertTrue(rl.check("a").allowed)


class Global(unittest.TestCase):
    def test_blocks_a_brand_new_client_once_the_cap_is_spent(self):
        rl, _ = make(per_minute=10, per_day=10, global_per_day=3)
        for key in ("a", "b", "c"):
            self.assertTrue(rl.check(key).allowed)
        d = rl.check("never-seen-before")
        self.assertFalse(d.allowed)
        self.assertEqual(d.scope, "global")

    def test_global_refusal_does_not_burn_the_clients_own_quota(self):
        # Timed so that a limiter which wrongly *charged* refusals would be
        # caught: a's hit (t=0) ages out of the global window first, while b's
        # refused attempts (t=50) would still be live in b's own day window.
        rl, clock = make(per_minute=100, per_day=3, global_per_day=1)
        rl.check("a")                              # t=0: spends the global cap
        clock.advance(50)
        for _ in range(5):                         # t=50: b refused, 5 times
            self.assertEqual(rl.check("b").scope, "global")
        clock.advance(DAY - 40)                    # t=DAY+10: a aged out, b's t=50 not
        # If those 5 refusals had been recorded, b would be over per_day=3 and
        # blocked here with scope "day".
        self.assertTrue(rl.check("b").allowed)

    def test_per_client_message_wins_over_global(self):
        rl, _ = make(per_minute=1, per_day=10, global_per_day=1)
        rl.check("a")
        self.assertEqual(rl.check("a").scope, "minute")

    def test_resets_after_a_day(self):
        rl, clock = make(global_per_day=1)
        rl.check("a")
        self.assertFalse(rl.check("b").allowed)
        clock.advance(DAY + 1)
        self.assertTrue(rl.check("b").allowed)


class Memory(unittest.TestCase):
    def test_rejected_requests_do_not_create_keys(self):
        # The old limiter used a defaultdict, so every rejected request still
        # allocated an entry — and with a spoofable key that is unbounded.
        rl, _ = make(per_minute=1, per_day=10, global_per_day=1)
        rl.check("real")
        for i in range(1_000):
            rl.check(f"attacker-{i}")
        self.assertEqual(len(rl._hits), 1)

    def test_table_is_bounded_by_the_global_cap(self):
        rl, _ = make(per_minute=5, per_day=5, global_per_day=50)
        for i in range(10_000):
            rl.check(f"ip-{i}")
        self.assertLessEqual(len(rl._hits), 50)

    def test_stale_clients_that_never_return_are_freed(self):
        # Pruning is lazy per client, so a one-time visitor would be held
        # forever without the periodic sweep.
        rl, clock = make(global_per_day=1_000)
        for i in range(20):
            rl.check(f"one-timer-{i}")
        self.assertEqual(len(rl._hits), 20)
        clock.advance(DAY + 1)
        rl.check("someone-else")               # triggers the sweep
        self.assertEqual(list(rl._hits), ["someone-else"])


class Validation(unittest.TestCase):
    def test_rejects_non_positive_limits(self):
        for bad in ((0, 1, 1), (1, 0, 1), (1, 1, 0), (-1, 1, 1)):
            with self.assertRaises(ValueError):
                RateLimiter(*bad)


class ResolveClientIp(unittest.TestCase):
    def test_ignores_forwarding_headers_by_default(self):
        # The bypass: a fresh fake header per request must not mint fresh keys.
        peer = "203.0.113.9"
        a = resolve_client_ip({"x-forwarded-for": "1.1.1.1"}, peer)
        b = resolve_client_ip({"x-forwarded-for": "2.2.2.2"}, peer)
        self.assertEqual(a, b)
        self.assertEqual(a, "203.0.113.9")

    def test_uses_the_trusted_header_when_configured(self):
        ip = resolve_client_ip({"cf-connecting-ip": "198.51.100.7"}, "127.0.0.1", "cf-connecting-ip")
        self.assertEqual(ip, "198.51.100.7")

    def test_header_name_is_case_insensitive_in_config(self):
        ip = resolve_client_ip({"cf-connecting-ip": "198.51.100.7"}, "127.0.0.1", "CF-Connecting-IP")
        self.assertEqual(ip, "198.51.100.7")

    def test_forwarded_for_takes_the_rightmost_entry(self):
        # Our proxy appends; everything to the left was client-supplied.
        ip = resolve_client_ip(
            {"x-forwarded-for": "6.6.6.6, 7.7.7.7, 198.51.100.7"},
            "127.0.0.1",
            "x-forwarded-for",
        )
        self.assertEqual(ip, "198.51.100.7")

    def test_spoofed_leftmost_entry_cannot_change_the_key(self):
        def key(spoof):
            return resolve_client_ip(
                {"x-forwarded-for": f"{spoof}, 198.51.100.7"}, "127.0.0.1", "x-forwarded-for"
            )
        self.assertEqual(key("1.1.1.1"), key("9.9.9.9"))

    def test_falls_back_to_the_peer_when_the_header_is_absent_or_blank(self):
        self.assertEqual(resolve_client_ip({}, "203.0.113.9", "cf-connecting-ip"), "203.0.113.9")
        self.assertEqual(
            resolve_client_ip({"cf-connecting-ip": "  "}, "203.0.113.9", "cf-connecting-ip"),
            "203.0.113.9",
        )

    def test_missing_peer(self):
        self.assertEqual(resolve_client_ip({}, None), "unknown")


class Ipv6Bucketing(unittest.TestCase):
    def test_addresses_in_one_slash_64_share_a_bucket(self):
        a = resolve_client_ip({}, "2001:db8:abcd:12::1")
        b = resolve_client_ip({}, "2001:db8:abcd:12:ffff:ffff:ffff:ffff")
        self.assertEqual(a, b)

    def test_different_slash_64s_are_different_buckets(self):
        a = resolve_client_ip({}, "2001:db8:abcd:12::1")
        b = resolve_client_ip({}, "2001:db8:abcd:13::1")
        self.assertNotEqual(a, b)

    def test_ipv4_mapped_ipv6_is_unwrapped(self):
        self.assertEqual(resolve_client_ip({}, "::ffff:203.0.113.9"), "203.0.113.9")

    def test_rotating_inside_a_slash_64_cannot_dodge_the_limit(self):
        rl, _ = make(per_minute=2, per_day=10, global_per_day=100)
        results = [
            rl.check(resolve_client_ip({}, f"2001:db8:abcd:12::{i:x}")).allowed
            for i in range(1, 6)
        ]
        self.assertEqual(results, [True, True, False, False, False])


if __name__ == "__main__":
    unittest.main()
