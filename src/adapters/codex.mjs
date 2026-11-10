// Codex adapter: the ChatGPT account through the Codex CLI. One Codex thread per
// Covenant thread (`codex exec` to open, `codex exec resume <id>` per turn), read-only
// at the codebase's root, so the Navigator reads the repo itself. Never --ephemeral.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectOf } from '../config.mjs';

const codexBin = process.platform === 'win32' ? 'codex.cmd' : 'codex';

function run(args, input, logPath, meta) {
  const project = projectOf(meta);
  const r = spawnSync(codexBin, args, {
    cwd: project.repoRoot,
    input,
    encoding: 'utf8',
    maxBuffer: 64e6,
    shell: process.platform === 'win32',
    timeout: project.cfg.browser.replyTimeoutSeconds * 1000,
  });
  if (logPath) writeFileSync(logPath, (r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''));
  if (r.status !== 0) throw new Error(`codex exec exited ${r.status}${logPath ? `; see ${logPath}` : ''}`);
  return r.stdout || '';
}

// --ignore-user-config keeps the user's Codex plugins and MCP servers out of the
// run, but it also drops `[windows] sandbox = "elevated"`, without which Codex's
// shell is "blocked by policy" on Windows. The needed bits are read back.
function userCodexConfig() {
  const p = join(homedir(), '.codex', 'config.toml');
  const out = { model: null, windowsSandbox: null };
  if (!existsSync(p)) return out;
  let section = '';
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    const h = line.match(/^\[([^\]]+)\]/);
    if (h) {
      section = h[1];
      continue;
    }
    const kv = line.match(/^(\w+)\s*=\s*"([^"]*)"/);
    if (!kv) continue;
    if (section === '' && kv[1] === 'model') out.model = kv[2];
    if (section === 'windows' && kv[1] === 'sandbox') out.windowsSandbox = kv[2];
  }
  return out;
}

// `codex exec resume` takes no -s / -C / --color: the session remembers them.
function baseArgs(meta, { resume = false } = {}) {
  const cfg = projectOf(meta).cfg;
  const user = userCodexConfig();
  const a = ['--json', '--ignore-user-config', '--skip-git-repo-check'];
  if (resume) a.push('--all');
  else a.push('-s', 'read-only', '-C', projectOf(meta).repoRoot, '--color', 'never');
  const model = cfg.codex.model || user.model;
  if (model) a.push('-m', model);
  if (cfg.codex.effort) a.push('-c', `model_reasoning_effort=${cfg.codex.effort}`);
  if (process.platform === 'win32' && user.windowsSandbox) a.push('-c', `windows.sandbox=${user.windowsSandbox}`);
  return a;
}

function threadIdFrom(jsonl) {
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const ev = JSON.parse(line);
      const id = ev.thread_id || ev.session_id || ev.thread?.id || ev.conversation_id;
      if (id) return id;
    } catch {}
  }
  return null;
}

export async function open({ message, meta, dir }) {
  const logDir = join(dir, 'codex');
  mkdirSync(logDir, { recursive: true });
  const out = join(logDir, 'reply-1.md');
  const t0 = Date.now();
  const jsonl = run(['exec', ...baseArgs(meta), '-o', out, '-'], message, join(logDir, 'turn-1.log'), meta);
  const threadId = threadIdFrom(jsonl);
  if (!threadId) throw new Error('codex printed no thread id; see codex/turn-1.log');
  return { chat: { threadId }, reply: readFileSync(out, 'utf8'), durationMs: Date.now() - t0, model: projectOf(meta).cfg.codex.model || userCodexConfig().model };
}

export async function turn({ chat, message, meta, dir, n }) {
  const logDir = join(dir, 'codex');
  mkdirSync(logDir, { recursive: true });
  const out = join(logDir, `reply-${n}.md`);
  const t0 = Date.now();
  run(['exec', 'resume', ...baseArgs(meta, { resume: true }), '-o', out, chat.threadId, '-'], message, join(logDir, `turn-${n}.log`), meta);
  return { reply: readFileSync(out, 'utf8'), durationMs: Date.now() - t0, chat };
}

export async function status() {
  return { ok: true, adapter: 'codex' };
}
