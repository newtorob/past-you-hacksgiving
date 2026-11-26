import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, TARGET_SHA } from '../src/history.js';
import { createModel, DEFAULT_PROPOSAL, investigate } from '../src/agent.js';
import { runReplay } from '../src/replay.js';

test('the historical regression test passes before and fails after the hypothetical change', async () => {
  const report = await runReplay();
  assert.equal(report.baseline.passed, true);
  assert.equal(report.regression.passed, false);
  assert.equal(report.regression.mutation_count, 1);
  assert.equal(report.comparison, 'regression-reproduced');
  assert.match(report.baseline.test, /proof_retry_only_considers/);
});

test('offline demo finds the actual historical decision and labels the analysis', async () => {
  const report = await investigate({ proposal: DEFAULT_PROPOSAL });
  assert.equal(report.status, 'complete');
  assert.equal(report.evidence.sha, TARGET_SHA);
  assert.equal(report.sourceMode, 'offline-fixture');
  assert.equal(report.modelMode, 'heuristic');
  assert.equal(report.test.comparison, 'regression-reproduced');
  assert.deepEqual(report.activity.map((step) => step.type), ['search', 'inspect', 'test']);
});

test('unrelated work produces no claim and does not run a test', async () => {
  let called = false;
  const report = await investigate({ proposal: 'Improve the observatory telescope alignment software.', replay: async () => { called = true; } });
  assert.equal(report.status, 'no-evidence');
  assert.equal(report.evidence, null);
  assert.equal(report.test, null);
  assert.equal(called, false);
});

test('a different matching commit does not receive the Potluck marker test', async () => {
  let called = false;
  const report = await investigate({ proposal: 'Improve the settings retry after a failed initial load.', replay: async () => { called = true; } });
  assert.notEqual(report.evidence.sha, TARGET_SHA);
  assert.equal(report.test, null);
  assert.equal(called, false);
});

test('tool-using model can search, inspect, run the permitted test, and cite inspected evidence', async () => {
  const messages = [];
  const scripted = [
    { role: 'assistant', content: null, tool_calls: [{ id: 's', type: 'function', function: { name: 'search_history', arguments: JSON.stringify({ query: 'retry tool markers' }) } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'i', type: 'function', function: { name: 'inspect_commit', arguments: JSON.stringify({ sha: TARGET_SHA }) } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'run_regression', arguments: '{}' } }] },
    { role: 'assistant', content: JSON.stringify({ source_sha: TARGET_SHA, summary: 'Prior retries needed matching markers.', recommendation: 'Preserve the existing marker check.' }) },
  ];
  const model = { name: 'scripted-test-model', async chat(history) { messages.push([...history]); return scripted.shift(); } };
  const fakeReplay = async () => ({ baseline: { passed: true }, regression: { passed: false }, comparison: 'regression-reproduced' });
  const report = await investigate({ proposal: DEFAULT_PROPOSAL, model, replay: fakeReplay });
  assert.equal(report.modelMode, 'model');
  assert.equal(report.evidence.sha, TARGET_SHA);
  assert.equal(report.test.comparison, 'regression-reproduced');
  assert.equal(messages.length, 4);
  assert.equal(messages[3].at(-1).role, 'tool');
});

test('the known regression runs when a model selects its inspected commit but omits the test', async () => {
  const call = (id, name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  const scripted = [
    call('s', 'search_history', { query: 'retry tool markers' }),
    call('i', 'inspect_commit', { sha: TARGET_SHA }),
    { role: 'assistant', content: JSON.stringify({ source_sha: TARGET_SHA, summary: 'Prior retries needed matching markers.', recommendation: 'Keep the marker check.' }) },
    { role: 'assistant', content: JSON.stringify({ source_sha: TARGET_SHA, summary: 'Prior retries needed matching markers.', recommendation: 'Keep the marker check; the hypothetical regression failed.' }) },
  ];
  let replays = 0;
  const messages = [];
  const model = { name: 'scripted-test-model', async chat(history) { messages.push([...history]); return scripted.shift(); } };
  const report = await investigate({ proposal: DEFAULT_PROPOSAL, model, replay: async () => {
    replays++;
    return { baseline: { passed: true }, regression: { passed: false }, comparison: 'regression-reproduced' };
  } });
  assert.equal(replays, 1);
  assert.equal(report.test.comparison, 'regression-reproduced');
  assert.equal(report.activity.at(-1).type, 'test');
  assert.match(messages.at(-1).at(-1).content, /regression-reproduced/);
});

test('a model cannot cite a commit it did not inspect', async () => {
  const model = { name: 'untrusted', async chat() { return { role: 'assistant', content: JSON.stringify({ source_sha: TARGET_SHA, summary: 'A claim', recommendation: 'An action' }) }; } };
  await assert.rejects(investigate({ proposal: DEFAULT_PROPOSAL, model }), /did not inspect/);
});

test('a test result cannot be attributed to a different inspected commit', async () => {
  const other = 'bbbbd8a3200099283738ceba090aa135fe641f7f';
  const call = (id, name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  const scripted = [
    call('s', 'search_history', { query: 'retry' }),
    call('i', 'inspect_commit', { sha: TARGET_SHA }),
    call('t', 'run_regression', {}),
    call('o', 'inspect_commit', { sha: other }),
    { role: 'assistant', content: JSON.stringify({ source_sha: other, summary: 'A claim', recommendation: 'An action' }) },
  ];
  const model = { name: 'untrusted', async chat() { return scripted.shift(); } };
  await assert.rejects(investigate({ proposal: DEFAULT_PROPOSAL, model, replay: async () => ({ comparison: 'regression-reproduced' }) }), /does not match the regression test/);
});

test('the live adapter calls only the configured Sprites GitHub gateway', async () => {
  const calls = [];
  const fixture = { sha: TARGET_SHA, commit: { message: 'A test commit', author: { date: '2026-10-21T15:45:07Z' } } };
  const history = createHistory({ connectorBase: 'https://api.sprites.dev/v1/gateway/github/test-connector', fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, json: async () => url.includes('/search/') ? { items: [fixture] } : fixture };
  } });
  const found = await history.search('retry tool');
  const inspected = await history.inspect(found[0].sha);
  assert.equal(inspected.sha, TARGET_SHA);
  assert.equal(history.mode, 'github-connector');
  assert.ok(calls.every((url) => url.startsWith('https://api.sprites.dev/v1/gateway/github/test-connector/')));
  assert.throws(() => createHistory({ connectorBase: 'https://attacker.example/' }), /Fly Sprites GitHub gateway/);
  assert.throws(() => createModel({ url: 'https://attacker.example/v1/chat/completions', name: 'x' }), /Fly Sprites connector gateway/);
});

test('public GitHub history uses only the fixed public API without account credentials', async () => {
  const calls = [];
  const fixture = { sha: TARGET_SHA, commit: { message: 'A test commit', author: { date: '2026-10-21T15:45:07Z' } } };
  const history = createHistory({ publicAccess: true, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('/search/') ? { items: [fixture] } : fixture };
  } });
  const found = await history.search('retry tool markers');
  await history.inspect(found[0].sha);
  assert.equal(history.mode, 'github-public');
  assert.ok(calls.every(({ url }) => url.startsWith('https://api.github.com/')));
  assert.ok(calls.every(({ options }) => !Object.keys(options.headers).some((header) => header.toLowerCase() === 'authorization')));
  assert.match(calls[0].url, /repo%3Anewtorob%2Fpotluck-ai/);
  assert.match(calls[1].url, /\/repos\/newtorob\/potluck-ai\/commits\//);
});

test('an Ollama credit error produces an actionable model-connection message', async () => {
  const model = createModel({
    url: 'https://api.sprites.dev/v1/gateway/ollama/example/v1/chat/completions',
    name: 'gpt-oss:20b',
    fetchImpl: async () => ({ ok: false, status: 402 }),
  });
  await assert.rejects(model.chat([{ role: 'user', content: 'Check this history.' }]), /usage credits/);
});
