import test from 'node:test';
import assert from 'node:assert/strict';
import { consume } from './src/quota.mjs';

test('minute cap expires while daily quota remains', () => {
  const limits = { minute: 1, day: 2, global: 4 };
  let result = consume([], 'a', 0, limits);
  result = consume(result.events, 'a', 1000, limits);
  assert.equal(result.allowed, false);
  assert.equal(result.retry, 59);
  result = consume(result.events, 'a', 60000, limits);
  assert.equal(result.allowed, true);
  result = consume(result.events, 'a', 120000, limits);
  assert.equal(result.scope, 'day');
});

test('global quota covers distinct clients and expires after a day', () => {
  const limits = { minute: 6, day: 60, global: 2 };
  let result = consume([], 'a', 0, limits);
  result = consume(result.events, 'b', 1000, limits);
  result = consume(result.events, 'c', 2000, limits);
  assert.equal(result.scope, 'global');
  assert.equal(result.events.length, 2);
  result = consume(result.events, 'c', 86400000, limits);
  assert.equal(result.allowed, true);
  assert.equal(result.events.length, 2);
});
