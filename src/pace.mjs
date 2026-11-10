// Human cadence for the extension lane: at least `minSecondsBetweenSends` between
// two sends and at most `dailySendCap` sends a day, counted in ~/.covenant/sends.json
// (the browser daemon keeps the same file). A short wait is served; a cap is a refusal.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './config.mjs';

const SENDS = join(HOME, 'sends.json');

export function pace(cfg) {
  const p = cfg.pace || {};
  const minGap = Number(p.minSecondsBetweenSends ?? cfg.browser?.minSecondsBetweenSends ?? 20);
  const cap = Number(p.dailySendCap ?? cfg.browser?.dailySendCap ?? 60);
  const today = new Date().toISOString().slice(0, 10);
  let s = {};
  try {
    s = JSON.parse(readFileSync(SENDS, 'utf8'));
  } catch {}
  if (s.day !== today) s = { day: today, count: 0, lastAt: 0 };
  if (cap && s.count >= cap) throw new Error(`daily send cap (${cap}) reached — raise pace.dailySendCap in .covenant.json or wait for tomorrow`);
  const wait = minGap * 1000 - (Date.now() - (s.lastAt || 0));
  let waited = 0;
  if (wait > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(wait, 120_000));
    waited = Math.min(wait, 120_000);
  }
  s.count++;
  s.lastAt = Date.now();
  writeFileSync(SENDS, JSON.stringify(s));
  return { sentToday: s.count, cap, waitedMs: waited };
}

export function paceStatus(cfg) {
  const today = new Date().toISOString().slice(0, 10);
  let s = {};
  try {
    s = JSON.parse(readFileSync(SENDS, 'utf8'));
  } catch {}
  if (s.day !== today) s = { day: today, count: 0, lastAt: 0 };
  return { sentToday: s.count, cap: Number(cfg.pace?.dailySendCap ?? cfg.browser?.dailySendCap ?? 60), file: existsSync(SENDS) ? SENDS : null };
}
