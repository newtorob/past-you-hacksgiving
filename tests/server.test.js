import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../src/server.js';
import { DEFAULT_PROPOSAL } from '../src/agent.js';
import { createRunGate } from '../src/limits.js';

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

test('the daily limit survives a server restart and fails closed on corrupt state', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'past-you-quota-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const quotaFile = join(directory, 'usage.json');
  let executions = 0;
  const replay = async () => {
    executions++;
    return { baseline: { passed: true }, regression: { passed: false }, comparison: 'regression-reproduced' };
  };
  const start = async (day) => {
    const gate = createRunGate({ dailyLimit: 2, quotaFile, now: () => new Date(`${day}T12:00:00Z`) });
    const server = makeServer({ model: null, replay, gate });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    return `http://127.0.0.1:${server.address().port}`;
  };
  const post = (url, proposal = DEFAULT_PROPOSAL) => fetch(`${url}/api/investigate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal }),
  });

  const first = await start('2026-11-26');
  assert.equal((await post(first, 'short')).status, 400);
  assert.equal((await post(first)).status, 200);
  assert.equal((await post(first)).status, 200);
  assert.equal((await post(first)).status, 429);
  assert.equal(executions, 2);
  assert.deepEqual(JSON.parse(await readFile(quotaFile, 'utf8')), { day: '2026-11-26', used: 2 });

  const restarted = await start('2026-11-26');
  assert.equal((await post(restarted)).status, 429);
  assert.equal(executions, 2);
  const nextDay = await start('2026-11-27');
  assert.equal((await post(nextDay)).status, 200);
  assert.equal(executions, 3);
  await writeFile(quotaFile, 'invalid state');
  assert.equal((await post(nextDay)).status, 503);
  assert.equal(executions, 3);
});

test('concurrent investigations are bounded and a small queue absorbs a burst', { timeout: 10000 }, async (t) => {
  let active = 0;
  let maxActive = 0;
  let started = 0;
  const releases = [];
  let signalTwo;
  let signalThree;
  const twoStarted = new Promise((resolve) => { signalTwo = resolve; });
  const threeStarted = new Promise((resolve) => { signalThree = resolve; });
  const replay = async () => {
    active++;
    started++;
    maxActive = Math.max(maxActive, active);
    if (started === 2) signalTwo();
    if (started === 3) signalThree();
    await new Promise((resolve) => releases.push(resolve));
    active--;
    return { baseline: { passed: true }, regression: { passed: false }, comparison: 'regression-reproduced' };
  };
  const server = makeServer({ model: null, replay, gate: createRunGate({ maxActive: 2, maxWaiting: 1, waitMs: 5000 }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const controller = new AbortController();
  t.after(() => { controller.abort(); for (const release of releases) release(); server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/investigate`;
  const post = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal: DEFAULT_PROPOSAL }), signal: controller.signal });
  const first = post();
  const second = post();
  await twoStarted;
  const third = post();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const overflow = await post();
  assert.equal(overflow.status, 503);
  assert.match((await overflow.json()).error, /busy/i);
  releases[0]();
  await threeStarted;
  releases[1]();
  releases[2]();
  assert.deepEqual((await Promise.all([first, second, third])).map((response) => response.status), [200, 200, 200]);
  assert.equal(maxActive, 2);
});

test('a disconnected queued visitor releases the waiting spot', async () => {
  const gate = createRunGate({ maxActive: 1, maxWaiting: 1, waitMs: 5000 });
  const response = () => Object.assign(new EventEmitter(), { destroyed: false });
  const first = await gate.acquire(response());
  const leaving = response();
  const waiting = gate.acquire(leaving);
  leaving.destroyed = true;
  leaving.emit('close');
  assert.equal(await waiting, null);
  const next = gate.acquire(response());
  first();
  const release = await next;
  assert.equal(typeof release, 'function');
  release();
});
