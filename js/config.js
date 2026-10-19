/** Shared frontend configuration. */

/**
 * The backend that holds the DeepSeek key and does retrieval.
 * Localhost is detected so local development needs no edit.
 */
export const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "https://omertwelve-github-io.amory30900.workers.dev";

export const ASK_ENDPOINT = `${API_BASE}/api/ask`;
export const HEALTH_ENDPOINT = `${API_BASE}/api/health`;

/** Turns of conversation sent back as context. Mirrors MAX_HISTORY_TURNS. */
export const HISTORY_TURNS = 6;

export const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
