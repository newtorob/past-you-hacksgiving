import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer } from '../src/server.js';
import { DEFAULT_PROPOSAL } from '../src/agent.js';

test('HTTP workflow serves the app, rejects invalid input, and returns a real offline replay', async (t) => {
  const server = makeServer({ model: null });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Before you change it/);
  const config = await (await fetch(`${origin}/api/config`)).json();
  assert.equal(config.sourceMode, 'offline-fixture');
  assert.equal(config.modelMode, 'heuristic');
  const bad = await fetch(`${origin}/api/investigate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal: 'short' }) });
  assert.equal(bad.status, 400);
  const result = await fetch(`${origin}/api/investigate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal: DEFAULT_PROPOSAL }) });
  assert.equal(result.status, 200);
  const report = await result.json();
  assert.equal(report.test.comparison, 'regression-reproduced');
  const crossOrigin = await fetch(`${origin}/api/investigate`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' }, body: JSON.stringify({ proposal: DEFAULT_PROPOSAL }) });
  assert.equal(crossOrigin.status, 403);
});
