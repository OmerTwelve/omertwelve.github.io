/**
 * Entry point.
 *
 * Each feature is a self-contained module that no-ops when its markup is
 * absent, so this file is just the wiring order — and removing a feature is
 * deleting one import and one call.
 *
 * Order is not load-bearing. initTheme() dispatches a `themechange` before the
 * canvas has subscribed, which is harmless: initHeroWave() reads the palette
 * directly at setup and only uses the event for later switches.
 */

import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initCopyEmail } from "./copy-email.js";
import { initHeroWave } from "./hero-wave.js";
import { initReveal } from "./reveal.js";
import { initNav } from "./nav.js";
import { initTerminal } from "./terminal/index.js";

const year = document.getElementById("yr");
if (year) year.textContent = new Date().getFullYear();

initTheme();
initClock();
initCopyEmail();
initHeroWave();
initReveal();
initNav();
initTerminal();
