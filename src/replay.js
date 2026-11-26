import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../fixtures/potluck/replay.py', import.meta.url));

function runVariant(variant) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [SCRIPT, variant], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 10000);
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(0, 10000); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(0, 2000); });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`Unable to start the regression test: ${error.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('The regression test timed out.'));
      let result;
      try { result = JSON.parse(stdout); } catch { return reject(new Error(`The regression test did not return a result. ${stderr}`.trim())); }
      if (result.error || (code !== 0 && code !== 1) || result.passed !== (code === 0)) {
        return reject(new Error(`The regression test could not complete: ${result.detail || 'unexpected exit'}`));
      }
      resolve(result);
    });
  });
}

export async function runReplay() {
  const baseline = await runVariant('baseline');
  const regression = await runVariant('regression');
  return {
    baseline,
    regression,
    comparison: baseline.passed && !regression.passed ? 'regression-reproduced' : 'inconclusive',
  };
}
