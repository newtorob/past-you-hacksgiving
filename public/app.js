const form = document.querySelector('#investigation-form');
const proposal = document.querySelector('#proposal');
const count = document.querySelector('#count');
const button = document.querySelector('#investigate');
const resultPanel = document.querySelector('.result-panel');
const resultContent = document.querySelector('#result-content');
const requestError = document.querySelector('#investigation-error');
const fieldError = document.querySelector('#proposal-error');
const environment = document.querySelector('#environment span:last-child');
const modeExplanation = document.querySelector('#mode-explanation');
let activeRequest = null;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function modeLabel(config) {
  if (config.sourceMode === 'github-connector' && config.modelMode === 'model') return 'GitHub + model configured';
  if (config.sourceMode === 'github-connector') return 'GitHub configured · simple matching';
  if (config.sourceMode === 'github-public' && config.modelMode === 'model') return 'Public GitHub + model configured';
  if (config.sourceMode === 'github-public') return 'Public GitHub · simple matching';
  if (config.modelMode === 'model') return 'Sample history · model configured';
  return 'Sample history · no model';
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Setup information is unavailable.');
    const config = await response.json();
    environment.textContent = modeLabel(config);
    document.querySelector('#repo-label').textContent = config.repository;
    if (!proposal.value) proposal.value = config.defaultProposal;
    updateCount();
    modeExplanation.textContent = config.sourceMode === 'offline-fixture'
      ? config.modelMode === 'model'
        ? 'Using saved public commit excerpts. Your proposed change and relevant excerpts go to the configured model.'
        : 'Using saved public commit excerpts. The test runs locally. Connect GitHub and a model for a live agent.'
      : config.sourceMode === 'github-public'
        ? config.modelMode === 'model'
          ? 'Search terms go to the public GitHub API without account access. Your change and relevant commit text go to the configured model.'
          : 'Search terms go to the public GitHub API without account access. This uses simple keyword matching; no model is connected.'
      : config.modelMode === 'model'
        ? 'Search terms go to GitHub. Your proposed change and relevant commit text go to the configured model.'
        : 'Search terms go to GitHub. This uses simple keyword matching; no model is connected.';
  } catch (error) {
    environment.textContent = 'Setup unavailable';
    modeExplanation.textContent = 'The app could not check its setup. Reload the page and try again.';
  }
}

function updateCount() { count.textContent = `${proposal.value.length.toLocaleString()} / 2,000`; }

function loading() {
  const card = node('div', 'loading-card');
  const inner = node('div');
  const spinner = node('div', 'loader');
  spinner.setAttribute('aria-hidden', 'true');
  inner.append(spinner, node('strong', '', 'Following the thread…'), node('p', '', 'Looking through history and checking the evidence. This can take a minute.'));
  card.append(inner);
  resultContent.replaceChildren(card);
}

function testTile(label, passed, detail) {
  const tile = node('div', `test-result${passed ? '' : ' bad'}`);
  tile.append(node('strong', '', passed ? 'PASS' : 'FAIL'), node('span', '', `${label}: ${detail}`));
  return tile;
}

function markdown(report) {
  const lines = [
    '# Past You handoff', '', `**Proposed change:** ${report.proposal}`, '',
    `**Source:** ${report.sourceMode === 'github-connector' ? 'GitHub connector' : report.sourceMode === 'github-public' ? 'Public GitHub API, without a connector' : 'Offline saved public commit excerpts'}`,
    `**Analysis:** ${report.modelMode === 'model' ? `Model (${report.model})` : 'Simple keyword matching, no model'}`, '',
    '## The note', '', report.summary, '', report.recommendation, '',
  ];
  if (report.evidence) lines.push('## Source', '', `[${report.evidence.sha.slice(0, 7)}](${report.evidence.url})`, '', report.evidence.message, '');
  if (report.test) lines.push('## Test', '', `- Historical code: ${report.test.baseline.passed ? 'PASS' : 'FAIL'}`,
    `- Hypothetical regression: ${report.test.regression.passed ? 'PASS' : 'FAIL'}`,
    `- Comparison: ${report.test.comparison}`, '', report.test.baseline.scope, '', `Test: ${report.test.baseline.test}`, '');
  else lines.push('## Test', '', 'No regression test was run.', '');
  if (report.test) lines.push('The replay removes the marker check as a predefined hypothetical regression; the proposed change above is text and was not executed. The test uses the original historical functions in an isolated harness with test doubles.');
  return lines.join('\n');
}

function showReport(report) {
  const wrapper = document.createDocumentFragment();
  const note = node('article', 'note-card');
  const label = report.modelMode === 'model' ? 'AGENT NOTE' : 'SIMPLE MATCH · NO MODEL';
  note.append(node('div', 'note-meta', label), node('h3', '', report.evidence ? 'A note from past you.' : 'No note found yet.'), node('p', '', report.summary), node('p', 'recommendation', report.recommendation));
  wrapper.append(note);

  if (report.evidence) {
    const source = node('section', 'source-card');
    source.append(node('h3', 'card-label', 'The source'));
    const link = node('a', 'source-link', report.evidence.message.split('\n')[0]);
    link.href = report.evidence.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    source.append(link);
    const parsedDate = new Date(report.evidence.date);
    const date = report.evidence.date && Number.isFinite(parsedDate.getTime()) ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsedDate) : 'Date unavailable';
    source.append(node('p', 'source-meta', `${report.evidence.sha.slice(0, 7)} · ${date} · ${report.sourceMode === 'github-connector' ? 'GitHub connector' : report.sourceMode === 'github-public' ? 'public GitHub API' : 'saved public excerpt'}`));
    wrapper.append(source);
  }

  const test = node('section', 'test-card');
  test.append(node('h3', 'card-label', 'The test'));
  if (report.test) {
    const grid = node('div', 'test-grid');
    grid.append(testTile('Historical code', report.test.baseline.passed, report.test.baseline.passed ? 'original test passed' : 'original test failed'),
      testTile('Hypothetical change', report.test.regression.passed, report.test.regression.passed ? 'original test passed' : 'original test failed'));
    test.append(grid, node('p', 'small-note', report.test.comparison === 'regression-reproduced'
      ? 'The original test caught the hypothetical regression.' : 'The comparison is inconclusive; review the individual results.'));
    test.append(node('p', 'small-note', 'This demo removes the marker check in memory. Your proposed change is text and was not executed.'));
    test.append(node('p', 'small-note', 'Original functions and test run in a minimal harness with network test doubles.'));
    test.append(node('p', 'small-note test-name', report.test.baseline.test));
  } else test.append(node('p', 'small-note', 'No regression test was run for this result.'));
  wrapper.append(test);

  if (report.activity?.length) {
    const trace = node('section', 'trace-card');
    const details = document.createElement('details');
    details.append(node('summary', '', 'See investigation steps'));
    const list = document.createElement('ol');
    for (const step of report.activity) list.append(node('li', '', step.label));
    details.append(list);
    trace.append(details);
    wrapper.append(trace);
  }
  const download = node('button', 'download', 'Download handoff');
  download.type = 'button';
  download.addEventListener('click', () => {
    const blob = new Blob([markdown(report)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'past-you-handoff.md';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  wrapper.append(download);
  resultContent.replaceChildren(wrapper);
}

proposal.addEventListener('input', () => {
  updateCount();
  if (proposal.value.trim().length >= 12) {
    fieldError.hidden = true;
    proposal.removeAttribute('aria-invalid');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeRequest) return;
  if (proposal.value.trim().length < 12 || proposal.value.length > 2000) {
    fieldError.textContent = 'Describe the change in 12 to 2,000 characters.';
    fieldError.hidden = false;
    proposal.setAttribute('aria-invalid', 'true');
    proposal.focus();
    return;
  }
  fieldError.hidden = true;
  proposal.removeAttribute('aria-invalid');
  requestError.hidden = true;
  button.disabled = true;
  button.querySelector('.button-label').textContent = 'Investigating…';
  resultPanel.setAttribute('aria-busy', 'true');
  loading();
  const controller = new AbortController();
  activeRequest = controller;
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch('/api/investigate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal: proposal.value }), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The investigation could not finish.');
    showReport(result);
  } catch (error) {
    resultContent.replaceChildren();
    requestError.textContent = error.name === 'AbortError' ? 'The investigation took too long. Check the connection, then try again.' : error.message;
    requestError.hidden = false;
  } finally {
    clearTimeout(timer);
    activeRequest = null;
    button.disabled = false;
    button.querySelector('.button-label').textContent = 'Ask Past You';
    resultPanel.setAttribute('aria-busy', 'false');
  }
});

loadConfig();
