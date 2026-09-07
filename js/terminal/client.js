/**
 * Transport for the RAG backend.
 *
 * Knows how to talk to the FastAPI service and how to parse its SSE stream;
 * knows nothing about the DOM. The controller supplies callbacks and does all
 * the rendering, which keeps the streaming logic testable on its own.
 */

import { ASK_ENDPOINT, HEALTH_ENDPOINT, HISTORY_TURNS } from "../config.js";

/** Corpus size and readiness, for the boot banner. Null if unreachable. */
export async function fetchHealth() {
  try {
    const res = await fetch(HEALTH_ENDPOINT);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Ask a question and stream the answer.
 *
 * @param {string} question
 * @param {Array<{role: string, content: string}>} convo  prior turns
 * @param {{onDelta: (text: string) => void,
 *          onDone: (info: {sources?: Array, usage?: object}) => void}} handlers
 * @throws {Error} with a message safe to show the visitor
 */
export async function askStream(question, convo, { onDelta, onDone }) {
  const res = await fetch(ASK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: convo.slice(-HISTORY_TURNS),
    }),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line. The final piece may be a
    // partial frame, so it stays in the buffer until its terminator arrives.
    const frames = buffer.split("\n\n");
    buffer = frames.pop();

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;

      let payload;
      try {
        payload = JSON.parse(line.slice(5).trim());
      } catch {
        continue; // a malformed frame shouldn't kill the stream
      }

      if (payload.error) throw new Error(payload.error);
      if (payload.delta) onDelta(payload.delta);
      if (payload.done) onDone(payload);
    }
  }
}
