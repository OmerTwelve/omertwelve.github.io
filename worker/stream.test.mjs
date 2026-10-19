import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { streamAnswer } from './src/index.mjs';

async function relay(parts) {
  const upstream = new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  } });
  const pipe = new TransformStream();
  const text = new Response(pipe.readable).text();
  await streamAnswer(upstream, pipe.writable.getWriter(), {});
  return (await text).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
}

test('fragmented upstream SSE preserves deltas and actual usage', async () => {
  const events = await relay([
    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
    '\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\ndata: [DONE]\n\n',
  ]);
  assert.equal(events[0].delta, 'Hi');
  assert.equal(events[1].done, true);
  assert.equal(events[1].usage.input_tokens, 100);
});

test('truncated answers produce an error rather than successful completion', async () => {
  const events = await relay(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n']);
  assert.ok(events.at(-1).error);
  assert.equal(events.some(event => event.done), false);
});

test('health exposes readiness and CORS; unapproved origins are rejected', async () => {
  const env = { ALLOWED_ORIGINS: 'https://omertwelve.github.io', DEEPSEEK_API_KEY: 'test-key' };
  const response = await worker.fetch(new Request('https://test/api/health', {
    headers: { Origin: 'https://omertwelve.github.io' },
  }), env, {});
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://omertwelve.github.io');
  assert.equal((await response.json()).key_configured, true);
  const denied = await worker.fetch(new Request('https://test/api/ask', {
    method: 'POST', headers: { Origin: 'https://unapproved.example' },
  }), env, {});
  assert.equal(denied.status, 403);
});
