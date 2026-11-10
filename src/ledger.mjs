// One thread = one directory under <dataDir>/threads/<yyyy-mm-dd>-<slug>/:
//   thread.json    metadata and state
//   brief.md       the compiled brief Gríma was given (snapshot)
//   events.jsonl   append-only: every message, every state change
//   transcript.md  rendered after every turn
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { nowIso, resolveProject } from './config.mjs';

export function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/-+$/g, '') || 'thread'
  );
}

const SECRET = /\b(sk-[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/g;
export const redact = (text) => String(text ?? '').replace(SECRET, '[redacted]');

export function createThread({ project, title, adapter, cap, question, goal, contextPaths, cwd, model, blind = false, mode = 'decide' }) {
  const date = nowIso().slice(0, 10);
  const slug = slugify(title);
  mkdirSync(project.threadsDir, { recursive: true });
  let dir = join(project.threadsDir, `${date}-${slug}`);
  for (let i = 2; existsSync(dir); i++) dir = join(project.threadsDir, `${date}-${slug}-${i}`);
  mkdirSync(dir, { recursive: true });
  const meta = {
    id: basename(dir),
    title,
    project: project.name,
    repoRoot: project.repoRoot,
    dataDir: project.dataDir,
    adapter,
    model: model || null,
    cap,
    goal: goal || null,
    mode, // decide: ends in a verdict · build: requirements → plan → execute → done
    phase: mode === 'build' ? 'requirements' : null,
    requirements: [],
    plan: null,
    lastVerdict: null,
    slack: null,
    blind,
    sent: 0,
    captainMessages: 0,
    lastStance: null,
    stances: [],
    watch: null,
    watchHistory: [],
    flags: {},
    state: 'open', // open | paused | closed
    gptTurns: 0,
    claudeTurns: 0,
    createdAt: nowIso(),
    closedAt: null,
    closedBy: null, // claude | gpt | cap | human | error
    verdict: null,
    pausedReason: null,
    cwd: cwd || null,
    question: question || title,
    contextPaths: contextPaths || [],
    chat: {}, // extension/browser: { url }; codex: { threadId }
  };
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `thread opened: ${title}` });
  return { dir, meta };
}

export const metaPath = (dir) => join(dir, 'thread.json');
export function loadThread(dir) {
  if (!existsSync(metaPath(dir))) throw new Error(`no thread at ${dir}`);
  return JSON.parse(readFileSync(metaPath(dir), 'utf8'));
}
export function saveThread(dir, meta) {
  writeFileSync(metaPath(dir), JSON.stringify(meta, null, 2) + '\n');
}

export function appendEvent(dir, ev) {
  const row = { ts: nowIso(), ...ev, text: redact(ev.text) };
  appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(row) + '\n');
  return row;
}

export function readEvents(dir) {
  const p = join(dir, 'events.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const label = { claude: 'Théoden (Claude)', gpt: 'Gríma (GPT)', human: 'Gandalf', watch: 'Háma', system: 'System' };

export function render(dir) {
  const meta = loadThread(dir);
  const events = readEvents(dir);
  const lines = [
    `# ${meta.title}`,
    '',
    `- Opened: ${meta.createdAt}${meta.closedAt ? ` · Closed: ${meta.closedAt} (${meta.closedBy})` : ''}`,
    `- State: ${meta.state}${meta.pausedReason ? ` — ${meta.pausedReason}` : ''}`,
    `- Adapter: ${meta.adapter}${meta.model ? ` · model ${meta.model}` : ''} · GPT turns ${meta.gptTurns}/${meta.cap}${meta.blind ? ' · blind first take' : ''}${meta.lastStance ? ` · GPT's last stance: ${meta.lastStance}` : ''}`,
    meta.goal ? `- Goal: ${meta.goal}` : null,
    meta.mode === 'build' ? `- Build: phase ${meta.phase}${meta.plan ? ` · plan v${meta.plan.version}${meta.plan.signedAt ? ` signed by ${meta.plan.signedBy}` : meta.plan.agreed ? ' agreed, unsigned' : ' under review'} · steps ${meta.plan.steps.filter((s) => s.status === 'agreed').length}/${meta.plan.steps.length} agreed` : ''}` : null,
    meta.watch ? `- Háma: ${meta.watch.verdict} after GPT turn ${meta.watch.afterGptTurn} — ${meta.watch.reason}` : null,
    meta.slack?.name ? `- Slack: #${meta.slack.name}` : null,
    meta.chat?.url ? `- Chat: ${meta.chat.url}` : meta.chat?.threadId ? `- Codex thread: ${meta.chat.threadId}` : null,
    meta.verdict ? `- Verdict: ${meta.verdict}` : null,
    '',
  ].filter((l) => l !== null);
  let n = 0;
  for (const ev of events) {
    if (ev.author === 'system') {
      lines.push(`> _${ev.ts} — ${ev.text}_`, '');
      continue;
    }
    if (ev.author === 'watch') {
      lines.push(`> **Háma** (${ev.ts.slice(11, 19)}): ${ev.text.replace(/\n/g, ' · ')}`, '');
      continue;
    }
    n++;
    const dur = ev.durationMs ? ` · ${Math.round(ev.durationMs / 1000)} s` : '';
    const stance = ev.stance ? ` · stance: ${ev.stance}${ev.confidence ? ` (${ev.confidence})` : ''}` : '';
    lines.push(`## ${n}. ${label[ev.author] || ev.author} — ${ev.ts.slice(11, 19)}${dur}${stance}`, '', ev.text.trim(), '');
  }
  writeFileSync(join(dir, 'transcript.md'), lines.join('\n') + '\n');
  return join(dir, 'transcript.md');
}

export function listThreads(threadsDir) {
  if (!threadsDir || !existsSync(threadsDir)) return [];
  return readdirSync(threadsDir)
    .filter((d) => existsSync(join(threadsDir, d, 'thread.json')))
    .sort()
    .map((d) => ({ dir: join(threadsDir, d), meta: loadThread(join(threadsDir, d)) }));
}

// --thread <absolute dir | id> or, without it, the one open thread of the cwd's project.
export function resolveThreadDir(arg, cwd = process.cwd()) {
  if (arg && arg !== true) {
    const asPath = isAbsolute(arg) ? arg : resolve(cwd, arg);
    if (existsSync(join(asPath, 'thread.json'))) return asPath;
    const project = resolveProject(cwd);
    const byId = join(project.threadsDir, basename(arg));
    if (existsSync(join(byId, 'thread.json'))) return byId;
    throw new Error(`no thread at ${arg}`);
  }
  const project = resolveProject(cwd);
  const open = listThreads(project.threadsDir).filter((t) => t.meta.state !== 'closed');
  if (open.length === 1) return open[0].dir;
  if (open.length === 0) throw new Error(`no open thread for ${project.name}; pass --thread <dir>`);
  throw new Error(`several open threads; pass --thread: ${open.map((t) => t.meta.id).join(', ')}`);
}
