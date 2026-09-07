/**
 * Scroll reveals.
 *
 * A position sweep rather than IntersectionObserver: a large scroll jump — an
 * anchor link, End, a restored scroll position — can move an element from
 * below the viewport to above it between two observer samples, and it then
 * never fires, leaving that section permanently invisible. Asking "is it at or
 * above the fold" each time cannot miss.
 */

import { prefersReducedMotion } from "./config.js";

export function initReveal() {
  let pending = Array.from(document.querySelectorAll(".reveal"));
  if (!pending.length) return;

  if (prefersReducedMotion) {
    pending.forEach((el) => el.classList.add("in"));
    return;
  }

  // Deliberately not rAF-coalesced: requestAnimationFrame is suspended
  // whenever the page is throttled or backgrounded, and a suspended sweep
  // means blank sections. The work is a handful of reads that shrinks to zero
  // as elements reveal, so running it inline is cheaper than that failure.
  const sweep = () => {
    const fold = window.innerHeight * 0.9;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].getBoundingClientRect().top < fold) {
        pending[i].classList.add("in");
        pending.splice(i, 1);
      }
    }
    if (!pending.length) {
      window.removeEventListener("scroll", sweep);
      window.removeEventListener("resize", sweep);
      document.removeEventListener("visibilitychange", sweep);
      window.removeEventListener("pageshow", sweep);
    }
  };

  window.addEventListener("scroll", sweep, { passive: true });
  window.addEventListener("resize", sweep);
  // Covers a page scrolled or position-restored while backgrounded, which
  // arrives visible with no scroll event left to fire.
  document.addEventListener("visibilitychange", sweep);
  window.addEventListener("pageshow", sweep);

  sweep();
}
