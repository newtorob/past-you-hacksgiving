const REPO = 'newtorob/potluck-ai';
export const TARGET_SHA = 'e72bb4677934c3b9a9d47f656e5550731d8f2223';

// These are verbatim excerpts from the public Potluck Git history. Fixture mode
// is a clearly marked offline demo; live mode must use a Sprites connector.
const FIXTURES = [
  {
    sha: TARGET_SHA,
    date: '2026-10-21T15:45:07Z',
    message: 'fix(gateway): a tool-proof retry only goes to a machine that proves the same markers [skip ci]\n\nThe reply to a proof request is read with the first machine\'s proven markers. A retry could land on an older release that lists none, and its real tool calls then came back as plain text. listed_markers() now parses the capability list for both the gateway and the retry.',
  },
  {
    sha: 'baae01258c7b84023ac8d2674e0e369c76b333f5',
    date: '2026-10-16T00:10:50Z',
    message: 'fix(cli): refresh verification after shell commands [skip ci]\n\nAn executed shell command can change files even when it exits nonzero. Invalidate earlier fixed-check evidence when the shell starts, keep the latest feedback explicitly pending, and recheck before accepting completion or after a subsequent file edit.',
  },
  {
    sha: 'bbbbd8a3200099283738ceba090aa135fe641f7f',
    date: '2026-10-16T01:11:41Z',
    message: 'fix(settings): recover from failed loads with retry [skip ci]\n\nShow an actionable error when the initial settings request fails, and let users retry in the same tab. Preserve cached panels and entered values through failed refreshes.',
  },
].map((item) => ({ ...item, url: `https://github.com/${REPO}/commit/${item.sha}` }));

function normalized(item) {
  const sha = item.sha;
  const commit = item.commit || {};
  if (!/^[0-9a-f]{40}$/i.test(sha || '')) throw new Error('GitHub returned an invalid commit ID.');
  return {
    sha: sha.toLowerCase(),
    url: `https://github.com/${REPO}/commit/${sha.toLowerCase()}`,
    message: String(commit.message || '').slice(0, 4000),
    date: commit.author?.date || null,
  };
}

function terms(query) {
  const stop = new Set(['the', 'and', 'for', 'with', 'when', 'this', 'that', 'from', 'into', 'have', 'where', 'another', 'machine']);
  return [...new Set(String(query).toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [])]
    .filter((word) => !stop.has(word)).slice(0, 8);
}

function rank(items, query) {
  const words = terms(query);
  return items.map((item) => {
    const haystack = item.message.toLowerCase();
    const score = words.reduce((n, word) => n + (haystack.includes(word) ? 1 : 0), 0);
    return { item, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ item }) => item);
}

export function createHistory({ connectorBase = '', publicAccess = false, fetchImpl = fetch } = {}) {
  const isConnector = Boolean(connectorBase);
  const isPublic = !isConnector && publicAccess;
  if (isConnector) {
    const parsed = new URL(connectorBase);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.sprites.dev' || !parsed.pathname.startsWith('/v1/gateway/github')) {
      throw new Error('The GitHub connector URL must use the Fly Sprites GitHub gateway.');
    }
  }
  const base = isConnector ? connectorBase.replace(/\/+$/, '') : isPublic ? 'https://api.github.com' : '';
  async function get(path) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'past-you-hacksgiving' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(isConnector ? 'Could not reach the GitHub connector. Check its connection and Sprite access.' : 'Could not reach the public GitHub API. Try again.');
    }
    if (!response.ok) throw new Error(`${isConnector ? 'GitHub connector' : 'Public GitHub API'} returned HTTP ${response.status}. Check access or rate limits and try again.`);
    return response.json();
  }
  return {
    mode: isConnector ? 'github-connector' : isPublic ? 'github-public' : 'offline-fixture',
    repo: REPO,
    async search(query) {
      if (typeof query !== 'string' || query.trim().length < 2 || query.length > 160) throw new Error('Search needs 2 to 160 characters.');
      if (!isConnector && !isPublic) return rank(FIXTURES, query).slice(0, 8);
      const keywords = terms(query).slice(0, 3).join(' ');
      if (!keywords) return [];
      const q = encodeURIComponent(`repo:${REPO} ${keywords}`);
      const result = await get(`/search/commits?q=${q}&per_page=12`);
      if (!Array.isArray(result.items)) throw new Error('GitHub returned an unexpected search response.');
      return result.items.map(normalized).slice(0, 8);
    },
    async inspect(sha) {
      if (!/^[0-9a-f]{40}$/i.test(sha || '')) throw new Error('A full commit ID is required.');
      if (!isConnector && !isPublic) {
        const found = FIXTURES.find((item) => item.sha === sha.toLowerCase());
        if (!found) throw new Error('That commit is not in the offline sample.');
        return found;
      }
      return normalized(await get(`/repos/${REPO}/commits/${sha}`));
    },
  };
}
