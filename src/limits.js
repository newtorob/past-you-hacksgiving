import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

// A single Sprite runs one service process. Keep its spending guard on disk so
// a restart or idle wake cannot reset the day's allowance.
export function createRunGate({ maxActive = 2, maxWaiting = 4, waitMs = 30000, dailyLimit = 0, quotaFile = '', now = () => new Date() } = {}) {
  for (const [name, value, min, max] of [
    ['maxActive', maxActive, 1, 8], ['maxWaiting', maxWaiting, 0, 50],
    ['waitMs', waitMs, 1, 120000], ['dailyLimit', dailyLimit, 0, 1000],
  ]) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name} setting.`);
  }
  if (dailyLimit && !isAbsolute(quotaFile)) throw new Error('A daily limit requires an absolute quota file path.');

  let active = 0;
  const waiting = [];

  function lease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      while (waiting.length && active < maxActive) {
        const next = waiting.shift();
        if (next.done) continue;
        active++;
        next.finish(lease());
      }
    };
  }

  function acquire(response) {
    if (response.destroyed) return Promise.resolve(null);
    if (active < maxActive) {
      active++;
      return Promise.resolve(lease());
    }
    if (waiting.length >= maxWaiting) return Promise.resolve(null);
    return new Promise((resolve) => {
      const item = { done: false, finish: null };
      const onClose = () => item.finish(null);
      const timer = setTimeout(() => item.finish(null), waitMs);
      timer.unref();
      item.finish = (result) => {
        if (item.done) return;
        item.done = true;
        clearTimeout(timer);
        response.off('close', onClose);
        const index = waiting.indexOf(item);
        if (index !== -1) waiting.splice(index, 1);
        resolve(result);
      };
      response.once('close', onClose);
      waiting.push(item);
      if (response.destroyed) item.finish(null);
    });
  }

  function reserve() {
    if (!dailyLimit) return true;
    const today = now().toISOString().slice(0, 10);
    let state;
    try {
      state = JSON.parse(readFileSync(quotaFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot read the usage limit.');
      state = { day: today, used: 0 };
    }
    if (!state || !/^\d{4}-\d{2}-\d{2}$/.test(state.day) || !Number.isSafeInteger(state.used) || state.used < 0 || state.day > today) {
      throw new Error('Invalid usage limit state.');
    }
    if (state.day !== today) state = { day: today, used: 0 };
    if (state.used >= dailyLimit) return false;
    state.used++;
    mkdirSync(dirname(quotaFile), { recursive: true, mode: 0o700 });
    const temporary = `${quotaFile}.${randomUUID()}.tmp`;
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(state)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, quotaFile);
    } catch {
      try { unlinkSync(temporary); } catch { /* No temporary file remains. */ }
      throw new Error('Cannot save the usage limit.');
    }
    return true;
  }

  return { acquire, reserve, dailyLimit };
}
