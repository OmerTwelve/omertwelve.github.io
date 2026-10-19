import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { Quota } from './src/index.mjs';

function limiter() {
  const values = new Map();
  const storage = { get: async key => structuredClone(values.get(key)),
    put: async (key, value) => values.set(key, structuredClone(value)) };
  storage.transaction = async fn => fn(storage);
  const quota = new Quota({ storage }, { TOKEN_PER_DAY: '100000' });
  return { values, call: async body => (await quota.fetch(new Request('https://quota/check', {
    method: 'POST', body: JSON.stringify(body),
  }))).json() };
}

test('daily token reservations cannot overspend and are isolated by IP', async () => {
  const { call } = limiter();
  assert.equal((await call({ ip: 'a', tokens: 60000, id: 'one' })).allowed, true);
  const denied = await call({ ip: 'a', tokens: 40001, id: 'two' });
  assert.equal(denied.allowed, false);
  assert.equal(denied.scope, 'tokens');
  assert.ok(denied.retry > 0);
  assert.equal((await call({ ip: 'b', tokens: 60000, id: 'three' })).allowed, true);
});

test('settlement uses actual input plus output and cannot be repeated', async () => {
  const { call } = limiter();
  await call({ ip: 'a', tokens: 90000, id: 'one' });
  await call({ action: 'settle', id: 'one', tokens: 10000 });
  await call({ action: 'settle', id: 'one', tokens: 0 });
  assert.equal((await call({ ip: 'a', tokens: 90000, id: 'two' })).allowed, true);
  assert.equal((await call({ ip: 'a', tokens: 1, id: 'three' })).scope, 'tokens');
});

test('expired reservations stop counting after 24 hours', async () => {
  const { call, values } = limiter();
  await call({ ip: 'a', tokens: 100000, id: 'one' });
  const budget = values.get('budget');
  budget[0].time = Date.now() - 86400000;
  values.set('budget', budget);
  assert.equal((await call({ ip: 'a', tokens: 100000, id: 'two' })).allowed, true);
});

test('streaming reconciles actual usage and budget rejection never calls DeepSeek', async () => {
  const { call, values } = limiter();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
      + 'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\n');
  };
  const pending = [];
  const env = { DEEPSEEK_API_KEY: 'test-key', LIMITER: {
    idFromName: name => name,
    get: () => ({ fetch: async (url, init) => Response.json(await call(JSON.parse(init.body))) }),
  } };
  const request = () => new Request('https://test/api/ask', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'a' },
    body: JSON.stringify({ question: 'What does Omer do?' }),
  });
  try {
    const response = await worker.fetch(request(), env, { waitUntil: promise => pending.push(promise) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /"done":true/);
    await Promise.all(pending);
    const budget = values.get('budget');
    assert.equal(budget[0].tokens, 110);
    assert.equal(budget[0].settled, true);
    budget[0].tokens = 100000;
    values.set('budget', budget);
    const denied = await worker.fetch(request(), env, {});
    assert.equal(denied.status, 429);
    assert.match((await denied.json()).error, /token budget/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
