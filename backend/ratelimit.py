"""Rate limiting for the public /api/ask endpoint.

Standard library only, and it does not import config, so it can be unit-tested
in isolation with an injected clock (see tests/test_ratelimit.py).

Three limits, checked together:

  per minute, per client   stops a single visitor hammering the endpoint
  per day,    per client   bounds what one visitor can spend
  per day,    global       bounds what *everyone* can spend — the one that
                           matters when the per-client limits are being dodged
                           by many addresses

State is in process memory. That is correct for a single worker and wrong for
more than one: each worker would get its own counters and every limit would
multiply by the worker count. Move the counters to Redis before scaling out.
"""

from __future__ import annotations

import ipaddress
import math
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable, Mapping

MINUTE = 60.0
DAY = 86_400.0


@dataclass(frozen=True)
class Decision:
    allowed: bool
    scope: str = ""        # "minute" | "day" | "global" when blocked
    retry_after: int = 0   # whole seconds; >= 1 when blocked


class RateLimiter:
    def __init__(
        self,
        per_minute: int,
        per_day: int,
        global_per_day: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if min(per_minute, per_day, global_per_day) < 1:
            raise ValueError("rate limits must be positive integers")
        self.per_minute = per_minute
        self.per_day = per_day
        self.global_per_day = global_per_day
        self._clock = clock

        # Accepted-request timestamps, oldest first. Only *accepted* requests
        # are ever recorded, and a key is only created when one is accepted —
        # so a rejected request cannot grow this dict. That bounds it by
        # global_per_day, since that caps accepted requests per day.
        self._hits: dict[str, deque[float]] = {}
        self._global: deque[float] = deque()
        self._next_sweep = 0.0

    @staticmethod
    def _prune(window: deque[float], now: float) -> None:
        while window and now - window[0] >= DAY:
            window.popleft()

    def _sweep(self, now: float) -> None:
        """Drop clients whose every hit has aged out.

        Pruning only happens when a client comes back, so without this an
        address that never returns would be held forever.
        """
        for key in list(self._hits):
            window = self._hits[key]
            self._prune(window, now)
            if not window:
                del self._hits[key]

    def check(self, key: str) -> Decision:
        """Decide whether `key` may proceed, and count it if so."""
        now = self._clock()
        self._prune(self._global, now)

        hits = self._hits.get(key)
        if hits is not None:
            self._prune(hits, now)

            # Per day first: if both limits trip, the longer wait is the honest
            # answer — telling someone to retry in 30s when they're out for the
            # day just sends them back to be refused again.
            if len(hits) >= self.per_day:
                return Decision(False, "day", _wait(hits[0] + DAY - now))

            # The per_minute-th most recent hit is the one that has to age past
            # 60s before a slot frees up.
            if len(hits) >= self.per_minute:
                oldest_in_window = hits[-self.per_minute]
                if now - oldest_in_window < MINUTE:
                    return Decision(False, "minute", _wait(oldest_in_window + MINUTE - now))

        # Checked after the per-client limits so a client over its own limit
        # gets the specific message, and so that a global refusal never
        # consumes a client's personal quota (nothing is recorded until below).
        if len(self._global) >= self.global_per_day:
            return Decision(False, "global", _wait(self._global[0] + DAY - now))

        self._hits.setdefault(key, deque()).append(now)
        self._global.append(now)

        if now >= self._next_sweep:
            self._sweep(now)
            self._next_sweep = now + MINUTE

        return Decision(True)


def _wait(seconds: float) -> int:
    return max(1, math.ceil(seconds))


def resolve_client_ip(
    headers: Mapping[str, str],
    peer: str | None,
    trusted_header: str = "",
) -> str:
    """The address to rate-limit, as a bucket key.

    By default this IGNORES forwarding headers and uses the socket peer. A
    header is attacker-controlled unless something you run overwrites it, so
    trusting one by default turns the limiter into a suggestion: a script that
    sends a fresh `X-Forwarded-For` per request never hits a limit.

    Set `trusted_header` only when the backend is reachable exclusively through
    a proxy that sets that header itself — e.g. `cf-connecting-ip` behind a
    Cloudflare tunnel, which Cloudflare overwrites on every request. If the
    port is also reachable directly, the header is attacker-controlled again.

    `headers` must have lower-case keys (Starlette's Headers does).
    """
    name = trusted_header.strip().lower()
    if name:
        value = headers.get(name, "")
        parts = [p.strip() for p in value.split(",") if p.strip()]
        if parts:
            # For X-Forwarded-For every proxy *appends* the address it saw, so
            # the entry added by our own proxy is the LAST one. Everything left
            # of it was supplied by the client and can be anything. For a
            # single-valued header like cf-connecting-ip this is the only value.
            return _bucket(parts[-1])
    return _bucket(peer or "unknown")


def _bucket(ip: str) -> str:
    """Normalise so one client can't hold many keys.

    A single IPv6 subscriber is routinely handed an entire /64 (2^64
    addresses). Keying on the full address would let them rotate through
    effectively unlimited fresh quotas, so IPv6 is bucketed by /64.
    IPv4-mapped IPv6 (::ffff:1.2.3.4) is unwrapped to the IPv4 it carries.
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip  # not an address (e.g. "unknown"); use it verbatim

    if addr.version == 6:
        if addr.ipv4_mapped:
            return str(addr.ipv4_mapped)
        return f"{ipaddress.ip_network(f'{addr}/64', strict=False).network_address}/64"
    return str(addr)
