/**
 * The animated EEG trace behind the hero.
 *
 * Three stacked channels of summed sines plus a little noise — not real data,
 * but it moves the way a scalp trace does. Colours are read from the CSS theme
 * tokens and re-read whenever the theme changes, so the canvas follows the
 * palette without this module knowing anything about the theme toggle.
 */

import { prefersReducedMotion } from "./config.js";
import { THEME_EVENT } from "./theme.js";

const root = document.documentElement;

// Each channel: baseline height as a fraction, stroke width, and a set of
// [amplitude, frequency, phase-speed] sine components.
const CHANNELS = [
  { y: 0.30, token: "--wave-1", width: 1.4, comps: [[14, 0.013, 0.9], [7, 0.031, -0.6], [4, 0.062, 1.4]] },
  { y: 0.58, token: "--wave-2", width: 1.1, comps: [[11, 0.010, 0.7], [6, 0.026, 1.1], [3, 0.055, -0.9]] },
  { y: 0.82, token: "--wave-3", width: 1.1, comps: [[9, 0.017, -0.5], [5, 0.038, 0.8], [3, 0.071, 1.2]] },
];

export function initHeroWave() {
  const canvas = document.getElementById("wave");
  if (!canvas?.getContext) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;

  const readColors = () => {
    const cs = getComputedStyle(root);
    CHANNELS.forEach((ch) => {
      ch.color = cs.getPropertyValue(ch.token).trim() || "currentColor";
    });
  };

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const trace = (ch, t) => {
    ctx.beginPath();
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = ch.width;
    ctx.lineJoin = "round";
    const baseline = h * ch.y;

    for (let x = 0; x <= w; x += 2) {
      let v = 0;
      for (const [amp, freq, speed] of ch.comps) v += amp * Math.sin(x * freq + t * speed);
      v += (Math.random() - 0.5) * 1.6; // sensor noise
      if (x === 0) ctx.moveTo(x, baseline + v);
      else ctx.lineTo(x, baseline + v);
    }
    ctx.stroke();
  };

  const drawAll = (t) => {
    ctx.clearRect(0, 0, w, h);
    for (const ch of CHANNELS) trace(ch, t);
  };

  readColors();
  resize();

  if (prefersReducedMotion) {
    // Static single pass — still a trace, just not animated.
    drawAll(0);
    window.addEventListener("resize", () => {
      resize();
      drawAll(0);
    });
    document.addEventListener(THEME_EVENT, () => {
      readColors();
      drawAll(0);
    });
    return;
  }

  window.addEventListener("resize", resize);
  document.addEventListener(THEME_EVENT, readColors);

  let t = 0;
  const frame = () => {
    drawAll(t);
    t += 0.02;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
