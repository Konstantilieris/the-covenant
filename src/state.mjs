// Which Claude Code session owns which thread.
//
// ~/.covenant/pending.json         a thread opened by `covenant open` without a
//                                  session id: { thread, cwd, at }
// ~/.covenant/sessions/<id>.json   { thread, cwd, boundAt } — the Stop hook of that
//                                  session relays into this thread
//
// `covenant open --session $CLAUDE_CODE_SESSION_ID` binds directly. Without a
// session id the first Stop hook that fires in the same cwd within CLAIM_WINDOW_MS
// claims the pending thread for its session.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, SESSIONS, nowIso } from './config.mjs';

const PENDING = join(HOME, 'pending.json');
const CLAIM_WINDOW_MS = 30 * 60 * 1000;

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const sessionFile = (id) => join(SESSIONS, `${String(id).replace(/[^\w.-]/g, '_')}.json`);

export function writePending(thread, cwd, sessionId) {
  if (sessionId) return { bound: sessionId, ...bindSession(sessionId, thread, cwd) };
  const cur = read(PENDING);
  if (cur && Date.now() - Date.parse(cur.at) < CLAIM_WINDOW_MS && existsSync(cur.thread)) {
    throw new Error(`another thread is waiting to be claimed (${cur.thread}); run \`covenant unclaim\` first`);
  }
  writeFileSync(PENDING, JSON.stringify({ thread, cwd, at: nowIso() }, null, 2));
  return { pending: true };
}

export function claimPending(sessionId, cwd) {
  const cur = read(PENDING);
  if (!cur) return null;
  if (Date.now() - Date.parse(cur.at) > CLAIM_WINDOW_MS || !existsSync(cur.thread)) {
    rmSync(PENDING, { force: true });
    return null;
  }
  if (cur.cwd && cwd && norm(cur.cwd) !== norm(cwd)) return null;
  rmSync(PENDING, { force: true });
  return bindSession(sessionId, cur.thread, cwd);
}

export function clearPending() {
  rmSync(PENDING, { force: true });
}

export function pendingInfo() {
  return read(PENDING);
}

export function bindSession(sessionId, thread, cwd) {
  const s = { thread, cwd: cwd || null, boundAt: nowIso() };
  writeFileSync(sessionFile(sessionId), JSON.stringify(s, null, 2));
  return s;
}

export function sessionState(sessionId) {
  const s = read(sessionFile(sessionId));
  if (s && !existsSync(s.thread)) {
    unbind(sessionId);
    return null;
  }
  return s;
}

export function unbind(sessionId) {
  rmSync(sessionFile(sessionId), { force: true });
}

export function unbindThread(thread) {
  for (const f of readdirSync(SESSIONS)) {
    const p = join(SESSIONS, f);
    const s = read(p);
    if (s && norm(s.thread) === norm(thread)) rmSync(p, { force: true });
  }
  const cur = read(PENDING);
  if (cur && norm(cur.thread) === norm(thread)) rmSync(PENDING, { force: true });
}

export function bindings() {
  const out = [];
  for (const f of readdirSync(SESSIONS)) {
    const s = read(join(SESSIONS, f));
    if (s) out.push({ session: f.replace(/\.json$/, ''), ...s });
  }
  return out;
}
