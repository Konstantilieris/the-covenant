// Optional Slack mirror. Off unless the repo's .covenant.json names a CLI:
//   { "slack": { "cli": "tools/slack/slack.mjs", "personas": { "claude": "claude", "gpt": "codex" }, "invite": "all" } }
// The CLI is expected to speak the subcommands of the Matcha bridge
// (channel create/archive, post --as --file, transcript --json). Every call is
// best-effort: a Slack failure is logged on the thread and never stops it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { projectOf } from './config.mjs';
import { appendEvent, loadThread, saveThread } from './ledger.mjs';

function cli(project) {
  const c = project.cfg.slack?.cli;
  if (!c) return null;
  const p = resolve(project.repoRoot, c);
  return existsSync(p) ? p : null;
}
function run(project, args) {
  return execFileSync(process.execPath, [cli(project), ...args], { cwd: project.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16e6 });
}
const note = (dir, text) => appendEvent(dir, { author: 'system', text: `slack: ${text}` });

export function slackOpen(dir) {
  const meta = loadThread(dir);
  const project = projectOf(meta);
  if (!cli(project)) return null;
  try {
    const name = `covenant-${meta.id.replace(/^\d{4}-\d{2}-\d{2}-/, '')}-${meta.id.slice(2, 4)}${meta.id.slice(5, 7)}${meta.id.slice(8, 10)}`.slice(0, 80);
    const args = ['channel', 'create', name];
    if (project.cfg.slack.invite) args.push('--invite', project.cfg.slack.invite);
    const outText = run(project, args).trim();
    const channel = (outText.match(/C[0-9A-Z]{8,}/) || [outText])[0];
    meta.slack = { channel, name };
    saveThread(dir, meta);
    post(dir, meta, `:handshake: *Covenant thread: ${meta.title}*\n_Goal:_ ${meta.goal}\n_Cap:_ ${meta.cap} Navigator turns · reply here to speak as the Captain; "stop" ends the thread_`, null);
    note(dir, `channel ${name} (${channel}) opened`);
    return meta.slack;
  } catch (e) {
    note(dir, `open failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    return null;
  }
}

export function slackPost(dir, author, text) {
  const meta = loadThread(dir);
  if (!meta.slack?.channel) return;
  const label = { claude: '*Chief*', gpt: '*Navigator*', human: '*Captain*', watch: '*Watch*' }[author] || author;
  post(dir, meta, `${label}\n${text}`, author);
}

function post(dir, meta, text, author) {
  const project = projectOf(meta);
  if (!cli(project)) return;
  const tmp = mkdtempSync(join(tmpdir(), 'covenant-slack-'));
  try {
    const f = join(tmp, 'msg.md');
    writeFileSync(f, text.length > 38000 ? text.slice(0, 38000) + '\n…(cut)' : text);
    const persona = author && project.cfg.slack.personas?.[author];
    run(project, ['post', meta.slack.channel, '--file', f, ...(persona ? ['--as', persona] : [])]);
  } catch (e) {
    note(dir, `post failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Human messages in the channel since the last pull, oldest first.
export function slackPull(dir) {
  const meta = loadThread(dir);
  const project = projectOf(meta);
  if (!meta.slack?.channel || !cli(project)) return [];
  try {
    const list = JSON.parse(run(project, ['transcript', meta.slack.channel, '--json']));
    const since = meta.slack.pulledTs || '0';
    const fresh = [];
    for (const m of list) {
      for (const x of [m, ...(m.replies || [])]) if (x.human && x.ts > since && !/has joined the channel/.test(x.text)) fresh.push({ ts: x.ts, user: x.user_name, text: x.text });
    }
    fresh.sort((a, b) => (a.ts > b.ts ? 1 : -1));
    if (fresh.length) {
      meta.slack.pulledTs = fresh[fresh.length - 1].ts;
      saveThread(dir, meta);
    }
    return fresh;
  } catch (e) {
    note(dir, `pull failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    return [];
  }
}

export function slackClose(dir) {
  const meta = loadThread(dir);
  const project = projectOf(meta);
  if (!meta.slack?.channel || !cli(project)) return;
  try {
    post(dir, meta, `:checkered_flag: *Closed by ${meta.closedBy}* — ${meta.verdict || ''}\n_Record:_ \`${meta.dataDir ? 'docs/covenant/threads/' + meta.id : meta.id}\``, null);
    run(project, ['channel', 'archive', meta.slack.channel]);
    note(dir, 'channel archived');
  } catch (e) {
    note(dir, `close failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}
