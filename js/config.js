/** Shared frontend configuration. */

/**
 * The backend that holds the Anthropic key and does retrieval.
 * Localhost is detected so local development needs no edit.
 */
export const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "https://REPLACE-WITH-YOUR-BACKEND-HOST";

export const ASK_ENDPOINT = `${API_BASE}/api/ask`;
export const HEALTH_ENDPOINT = `${API_BASE}/api/health`;

/** Claude Opus 5 list price, USD per million tokens. */
export const PRICE_IN = 5.0;
export const PRICE_OUT = 25.0;

/** Turns of conversation sent back as context. Mirrors MAX_HISTORY_TURNS. */
export const HISTORY_TURNS = 6;

export const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
