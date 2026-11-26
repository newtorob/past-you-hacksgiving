import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHistory } from './history.js';
import { createModel, DEFAULT_PROPOSAL, investigate } from './agent.js';
import { createRunGate } from './limits.js';

const ASSETS = new Map([
  ['/', ['../public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['../public/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['../public/app.js', 'text/javascript; charset=utf-8']],
]);

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function bodyJSON(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 8192) throw new Error('Request is too large.');
  }
  try { return JSON.parse(body); } catch { throw new Error('Request must contain valid JSON.'); }
}

export function makeServer({ history, model, replay, gate } = {}) {
  const selectedHistory = history || createHistory({
    connectorBase: process.env.PASTYOU_GITHUB_CONNECTOR || '',
    publicAccess: process.env.PASTYOU_GITHUB_PUBLIC === '1',
  });
  const selectedModel = model === undefined ? createModel({ url: process.env.PASTYOU_MODEL_URL, name: process.env.PASTYOU_MODEL }) : model;
  const runGate = gate || createRunGate({
    dailyLimit: Number(process.env.PASTYOU_DAILY_LIMIT || 0),
    quotaFile: process.env.PASTYOU_QUOTA_FILE || '',
  });
  return createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const path = new URL(req.url, 'http://local').pathname;
    if (req.method === 'GET' && ASSETS.has(path)) {
      const [file, type] = ASSETS.get(path);
      try {
        const data = await readFile(new URL(file, import.meta.url));
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
        return res.end(data);
      } catch { return json(res, 500, { error: 'The application could not load.' }); }
    }
    if (req.method === 'GET' && path === '/api/config') {
      return json(res, 200, { repository: selectedHistory.repo, sourceMode: selectedHistory.mode, modelMode: selectedModel ? 'model' : 'heuristic', defaultProposal: DEFAULT_PROPOSAL, dailyLimit: runGate.dailyLimit || null });
    }
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && path === '/api/investigate') {
      // A browser from another origin cannot use this endpoint to spend model credits.
      const origin = req.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Requests must come from this application.' });
        } catch { return json(res, 403, { error: 'Invalid request origin.' }); }
      }
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(res, 415, { error: 'Use a JSON request.' });
      let payload;
      try { payload = await bodyJSON(req); } catch (error) { return json(res, 400, { error: error.message }); }
      if (typeof payload?.proposal !== 'string' || payload.proposal.trim().length < 12 || payload.proposal.length > 2000) {
        return json(res, 400, { error: 'Describe the proposed change in 12 to 2,000 characters.' });
      }
      const release = await runGate.acquire(res);
      if (!release) {
        if (res.destroyed) return;
        res.setHeader('retry-after', '30');
        return json(res, 503, { error: 'Past You is busy. Please try again in a moment.' });
      }
      try {
        if (res.destroyed) return;
        let allowed;
        try { allowed = runGate.reserve(); } catch { return json(res, 503, { error: 'The demo usage limit is temporarily unavailable. Please try again later.' }); }
        if (!allowed) return json(res, 429, { error: 'The demo has reached its daily investigation limit. Please try again after 00:00 UTC.' });
        const result = await investigate({ proposal: payload.proposal, history: selectedHistory, model: selectedModel, ...(replay ? { replay } : {}) });
        return json(res, 200, result);
      } catch (error) {
        return json(res, 502, { error: error.message || 'The investigation could not finish.' });
      } finally { release(); }
    }
    return json(res, 404, { error: 'Not found.' });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8080);
  makeServer().listen(port, host, () => console.log(`Past You is listening on http://${host}:${port}`));
}
