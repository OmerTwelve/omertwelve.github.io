/**
 * Nav behaviour: active-section highlighting, and publishing the nav's height.
 */

const root = document.documentElement;

/**
 * The terminal sits directly below the sticky nav, so it needs the nav's real
 * height. It is measured rather than assumed because the nav wraps to two rows
 * under 720px — a hardcoded value either clips the terminal or leaves a gap.
 */
export function syncNavHeight() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  root.style.setProperty("--nav-h", `${nav.getBoundingClientRect().height}px`);
}

export function initNav() {
  syncNavHeight();
  window.addEventListener("resize", syncNavHeight);

  const links = Array.from(document.querySelectorAll(".nav-links a"));
  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  if (!("IntersectionObserver" in window) || !sections.length) return;

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) =>
          a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`),
        );
      });
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );

  sections.forEach((s) => spy.observe(s));
}
