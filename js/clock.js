/**
 * Abu Dhabi clock in the nav.
 *
 * Pinned to Asia/Dubai rather than the viewer's own clock: the point is to
 * show a recruiter what time it is for Omer, not for themselves.
 */

export function initClock() {
  const el = document.getElementById("clock-time");
  if (!el) return;

  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    // No Intl timezone data — hide it rather than show a wrong time.
    el.closest(".clock").hidden = true;
    return;
  }

  const tick = () => {
    el.textContent = fmt.format(new Date());
  };
  tick();
  setInterval(tick, 1000);
}
