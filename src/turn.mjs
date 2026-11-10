// One exchange: the Chief's message goes in, the Navigator's reply comes out, the
// ledger records both, and the thread's state moves. Used by the Stop hook and by
// `covenant turn` (hook lanes), and by `covenant record` / `covenant outgoing`
// (extension lane).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gitBranch, nowIso, projectOf } from './config.mjs';
import { compileBrief } from './brief.mjs';
import { appendEvent, loadThread, readEvents, render, saveThread } from './ledger.mjs';
import { unbindThread } from './state.mjs';
import { applyVerdict, buildSendGate } from './build.mjs';
import { slackClose, slackPost } from './slack.mjs';

const adapters = {
  browser: () => import('./adapters/browser.mjs'),
  codex: () => import('./adapters/codex.mjs'),
  openai: () => import('./adapters/openai.mjs'),
};

const cfgFor = (meta) => projectOf(meta).cfg;

export function closeLineIn(text, closeLine) {
  const m = String(text || '').match(new RegExp(`^\\s*${closeLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.*)$`, 'mi'));
  return m ? m[1].trim() || '(no verdict given)' : null;
}

const STANCE = /^\s*STANCE:\s*(.+?)\s*$/im;
const CONFIDENCE = /^\s*CONFIDENCE:\s*(.+?)\s*$/im;
export function footerOf(text) {
  const s = String(text || '').match(STANCE);
  const c = String(text || '').match(CONFIDENCE);
  return { stance: s ? s[1] : null, confidence: c ? c[1] : null };
}

function noteStance(meta, footer) {
  if (!footer.stance) return;
  meta.lastStance = `${footer.stance}${footer.confidence ? ` (${footer.confidence})` : ''}`;
  meta.stances = [...(meta.stances || []), footer.stance];
}

// ---------------------------------------------------------------- hook lanes
export async function exchange({ dir, claudeText, author = 'claude' }) {
  const meta = loadThread(dir);
  const cfg = cfgFor(meta);
  if (meta.adapter === 'extension') return { kind: 'skipped', reason: 'extension-lane thread: use record/outgoing, not turn', meta };
  if (meta.state !== 'open') return { kind: 'skipped', reason: `thread is ${meta.state}`, meta };
  const text = String(claudeText || '').trim();
  if (text.length < cfg.minMessageChars) return { kind: 'skipped', reason: 'message too short to relay', meta };

  appendEvent(dir, { author, text });
  meta.claudeTurns++;
  saveThread(dir, meta);

  const verdict = closeLineIn(text, cfg.closeLine);
  if (verdict) {
    await closeThread(dir, { by: author, verdict });
    return { kind: 'closed-by-claude', verdict, meta: loadThread(dir) };
  }

  const adapter = await adapters[meta.adapter]();
  const n = meta.gptTurns + 1;
  let result;
  try {
    if (n === 1) {
      const brief = compileBrief(meta);
      writeFileSync(join(dir, 'brief.md'), brief);
      const message = `${brief}\n\n---\n\n## The Chief's opening message\n\n${text}`;
      result = await adapter.open({ message, meta, dir });
      meta.chat = result.chat;
      if (result.model) meta.model = result.model;
    } else {
      const message = `## Chief (turn ${meta.claudeTurns})\n\n${text}`;
      result = await adapter.turn({ chat: meta.chat, message, meta, dir, n });
      if (result.chat) meta.chat = result.chat;
    }
  } catch (e) {
    meta.state = 'paused';
    meta.pausedReason = String(e.message || e);
    saveThread(dir, meta);
    appendEvent(dir, { author: 'system', text: `paused: ${meta.pausedReason}` });
    render(dir);
    return { kind: 'paused', reason: meta.pausedReason, meta };
  }

  const reply = String(result.reply || '').trim();
  const footer = footerOf(reply);
  appendEvent(dir, { author: 'gpt', text: reply, durationMs: result.durationMs, ...(footer.stance ? { stance: footer.stance, confidence: footer.confidence } : {}) });
  meta.gptTurns = n;
  noteStance(meta, footer);
  saveThread(dir, meta);
  render(dir);

  const gptVerdict = closeLineIn(reply, cfg.closeLine);
  if (gptVerdict) {
    await closeThread(dir, { by: 'gpt', verdict: gptVerdict });
    return { kind: 'closed-by-gpt', reply, verdict: gptVerdict, meta: loadThread(dir) };
  }
  if (meta.gptTurns >= meta.cap) {
    await closeThread(dir, { by: 'cap', verdict: `cap of ${meta.cap} GPT turns reached` });
    return { kind: 'cap', reply, meta: loadThread(dir) };
  }
  return { kind: 'relayed', reply, meta };
}

// ------------------------------------------------------------ extension lane
// The brake. A paused thread takes no new Chief message, and no message is sent
// while the latest Navigator reply is unreviewed by the Watch. Only `covenant resume`
// (the Captain's word) reopens a paused thread.
export function sendGate(meta, cfg = cfgFor(meta)) {
  if (meta.state !== 'open') return `the council is ${meta.state}${meta.pausedReason ? `: ${meta.pausedReason}` : ''} — only \`covenant resume\` (Gandalf) opens the door`;
  if (cfg.watch?.required !== false && meta.gptTurns > 0 && (!meta.watch || meta.watch.afterGptTurn < meta.gptTurns)) {
    return `Háma has not reviewed Gríma's turn ${meta.gptTurns}: run \`covenant watch-brief\` → covenant-watch agent → \`covenant record --author watch\` first`;
  }
  return buildSendGate(meta);
}

export async function recordOnly({ dir, author, text, chatUrl }) {
  const meta = loadThread(dir);
  const cfg = cfgFor(meta);
  if (meta.state === 'closed') return { kind: 'skipped', reason: 'thread is closed', meta };
  if (meta.state === 'paused' && author === 'claude') return { kind: 'skipped', reason: `the council is paused: ${meta.pausedReason || ''} — Gandalf opens the door with \`covenant resume\``, meta };
  const t = String(text || '').trim();
  if (!t) return { kind: 'skipped', reason: 'empty message', meta };
  if (author === 'watch') return recordWatch(dir, meta, t);

  const footer = author === 'gpt' ? footerOf(t) : {};
  appendEvent(dir, { author, text: t, ...(footer.stance ? { stance: footer.stance, confidence: footer.confidence } : {}) });
  if (author === 'claude') meta.claudeTurns++;
  if (author === 'gpt') {
    meta.gptTurns++;
    noteStance(meta, footer);
    if (meta.mode === 'build') applyVerdict(dir, meta, t); // plan agreed / step agreed / rework / blocked
  }
  if (author === 'human') meta.captainMessages = (meta.captainMessages || 0) + 1;
  if (chatUrl) meta.chat = { ...meta.chat, url: chatUrl };
  saveThread(dir, meta);
  try {
    slackPost(dir, author, t);
  } catch {}

  // The guard: needs no model.
  const flags = {};
  if (author === 'gpt') {
    const last3 = (meta.stances || []).slice(-3);
    if (last3.length === 3 && last3.every((s) => /^hold/i.test(s))) flags.stalled = true;
  }
  const hours = (Date.now() - Date.parse(meta.createdAt)) / 36e5;
  if (cfg.maxThreadHours && hours > cfg.maxThreadHours && meta.state === 'open') {
    meta.state = 'paused';
    meta.pausedReason = `time budget of ${cfg.maxThreadHours} h spent`;
    flags.timeBudget = true;
    appendEvent(dir, { author: 'system', text: `paused: ${meta.pausedReason}` });
  }
  meta.flags = flags;
  saveThread(dir, meta);
  render(dir);

  const verdict = closeLineIn(t, cfg.closeLine);
  if (verdict && (author === 'claude' || author === 'gpt')) {
    await closeThread(dir, { by: author, verdict });
    return { kind: author === 'gpt' ? 'closed-by-gpt' : 'closed-by-claude', verdict, meta: loadThread(dir) };
  }
  if (author === 'gpt' && meta.gptTurns >= meta.cap) {
    await closeThread(dir, { by: 'cap', verdict: `cap of ${meta.cap} GPT turns reached` });
    return { kind: 'cap', meta: loadThread(dir) };
  }
  return { kind: 'recorded', meta, flags };
}

// The Watch's verdict: strict JSON from the covenant-watch agent.
function recordWatch(dir, meta, raw) {
  let v;
  try {
    const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    v = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1));
  } catch (e) {
    throw new Error(`watch verdict is not JSON: ${e.message}`);
  }
  const verdict = String(v.verdict || '').toLowerCase();
  if (!['on-course', 'nudge', 'pause', 'close'].includes(verdict)) throw new Error(`watch verdict must be on-course|nudge|pause|close, got "${v.verdict}"`);
  const entry = { verdict, progress: v.progress || null, reason: v.reason || '', nudge: v.nudge || null, verdictLine: v.verdictLine || null, safety: Array.isArray(v.safety) ? v.safety : [], at: nowIso(), afterGptTurn: meta.gptTurns };
  appendEvent(dir, { author: 'watch', text: `${verdict}${entry.progress ? ` (${entry.progress})` : ''}: ${entry.reason}${entry.nudge ? `\nNudge: ${entry.nudge}` : ''}${entry.verdictLine ? `\nVerdict line: ${entry.verdictLine}` : ''}${entry.safety.length ? `\nSafety: ${entry.safety.join('; ')}` : ''}`, verdict, progress: entry.progress });
  meta.watch = entry;
  meta.watchHistory = [...(meta.watchHistory || []), entry];
  if (verdict === 'pause' && meta.state === 'open') {
    meta.state = 'paused';
    meta.pausedReason = `watch: ${entry.reason}`;
  }
  saveThread(dir, meta);
  render(dir);
  return { kind: 'watch', verdict, watch: entry, meta };
}

// The Watch's input: goal, budget, stance history, the last exchanges. Printed by
// `covenant watch-brief` and handed to the covenant-watch agent as its prompt.
export function watchBrief(dir, { exchanges = 3, maxChars = 3000 } = {}) {
  const meta = loadThread(dir);
  const events = readEvents(dir).filter((e) => ['claude', 'gpt', 'human'].includes(e.author));
  const recent = events.slice(-(exchanges * 2 + 1));
  const label = { claude: 'Théoden (Claude Code, the king)', gpt: 'Gríma (ChatGPT, the counsel)', human: 'Gandalf (the owner)' };
  const cut = (s) => (s.length > maxChars ? s.slice(0, maxChars) + '\n…(cut)' : s);
  const hours = ((Date.now() - Date.parse(meta.createdAt)) / 36e5).toFixed(1);
  const lines = [
    `# Háma's brief — council ${meta.id}`,
    '',
    `**Goal:** ${meta.goal || '(none stated)'}`,
    `**Question:** ${meta.question}`,
    `**Budget:** Gríma turn ${meta.gptTurns} of ${meta.cap}; ${hours} h elapsed; blind first take: ${meta.blind ? 'yes' : 'no'}`,
    `**Gríma's stances so far:** ${(meta.stances || []).join(' → ') || '(none)'}`,
    `**Previous verdict of Háma:** ${meta.watch ? `${meta.watch.verdict} after turn ${meta.watch.afterGptTurn}: ${meta.watch.reason}` : '(none)'}`,
    '',
    `## The last ${Math.min(recent.length, exchanges * 2 + 1)} messages, oldest first`,
  ];
  for (const e of recent) lines.push('', `### ${label[e.author]} — ${e.ts.slice(11, 19)}${e.stance ? ` — stance: ${e.stance}` : ''}`, '', cut(e.text));
  lines.push(
    '',
    '## Your task',
    '',
    'Judge this exchange against the goal and return ONLY the JSON object described in your instructions: verdict (on-course | nudge | pause | close), progress (advancing | stalled | looping | off-goal), reason (≤ 40 words), nudge (≤ 30 words or null), verdictLine (≤ 20 words or null), safety (array of strings, usually empty).',
  );
  return lines.join('\n');
}

// Blind first take: the first send carries the question alone, the Navigator answers
// unanchored, and the Chief's position (written and recorded before that answer)
// goes in the second send. In build mode the first send is the brief plus the
// requirements question; the plan and the step reviews travel as `text`.
export function outgoingText({ dir, text, lean }) {
  const meta = loadThread(dir);
  const t = String(text || '').trim();
  if (meta.gptTurns === 0) {
    const brief = compileBrief(meta, { lean });
    writeFileSync(join(dir, 'brief.md'), brief);
    if (meta.mode === 'build') {
      appendEvent(dir, { author: 'system', text: 'sent to Gríma: the brief and the build goal (requirements phase)' });
      return `${brief}\n\n---\n\n## Requirements\n\n${t || meta.question}\n\nList the acceptance requirements you would hold this build to, numbered R1…; the king will answer with his plan. End with the stance footer.`;
    }
    if (meta.blind) {
      appendEvent(dir, { author: 'system', text: 'sent to Gríma: the question alone (blind first take)' });
      return `${brief}\n\n---\n\n## The question\n\n${meta.question}\n\nAnswer it yourself first, in full, under "My take". The king's position follows in the next message; do not wait for it.`;
    }
    return `${brief}\n\n---\n\n## The king's opening message\n\n${t}`;
  }
  if (meta.blind && meta.gptTurns === 1) {
    appendEvent(dir, { author: 'system', text: "sent to Gríma: the king's position (written before Gríma's first reply)" });
    return `## The king's position (written before your first reply)\n\n${t}\n\nNow compare it with your take under "On the king's position": where you differ, what evidence would move you, and your recommendation.`;
  }
  return `## Théoden (turn ${meta.claudeTurns || 1})\n\n${t}`;
}

export async function closeThread(dir, { by, verdict }) {
  const meta = loadThread(dir);
  const project = projectOf(meta);
  const cfg = project.cfg;
  if (meta.state === 'closed') return meta;
  meta.state = 'closed';
  meta.closedAt = nowIso();
  meta.closedBy = by;
  meta.verdict = verdict || meta.verdict;
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `closed by ${by}: ${meta.verdict || ''}` });
  render(dir);
  unbindThread(dir);
  try {
    slackClose(dir);
  } catch {}

  const ledger = join(project.dataDir, 'ledger.md');
  const rel = relative(project.repoRoot, dir).replace(/\\/g, '/');
  if (!existsSync(ledger)) writeFileSync(ledger, `# Covenant ledger — ${meta.project}\n\nOne line per closed thread, oldest first.\n\n`);
  appendFileSync(ledger, `- ${meta.closedAt.slice(0, 10)} — **${meta.title}** — ${meta.verdict || '(no verdict)'} — closed by ${by} after ${meta.gptTurns} GPT turns${meta.lastStance ? ` — GPT's last stance: ${meta.lastStance}` : ''} — \`${rel}\`\n`);

  commit(project, meta, [rel, relative(project.repoRoot, ledger).replace(/\\/g, '/')], cfg);
  return meta;
}

// The record is committed into the codebase, on its current branch, only those
// paths. Never on main/master; push only the current branch.
function commit(project, meta, paths, cfg) {
  const git = (...a) => execFileSync('git', ['-C', project.repoRoot, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const note = (text) => appendEvent(join(project.threadsDir, meta.id), { author: 'system', text });
  const branch = gitBranch(project.repoRoot);
  if (!branch || ['main', 'master'].includes(branch)) {
    note(`not committed: on branch ${branch || '?'} — commit the thread from a feature branch`);
    return;
  }
  try {
    git('add', ...paths);
    git('commit', '-q', '--only', ...paths, '-m', `docs(covenant): ${meta.title} — ${meta.closedBy} after ${meta.gptTurns} GPT turns`);
    note(`committed on ${branch}`);
  } catch (e) {
    note(`commit failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    return;
  }
  if (!cfg.pushAtClose) return;
  try {
    git('push', '-q', 'origin', 'HEAD');
    note(`pushed ${branch}`);
  } catch (e) {
    note(`push failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}

export function frameForClaude(r, cfg = loadConfigSafe(r.meta)) {
  const m = r.meta;
  const head = `[Covenant · Gríma turn ${m.gptTurns}/${m.cap} · council ${m.id}]`;
  switch (r.kind) {
    case 'relayed':
      return `${head}\n\n${r.reply}\n\n---\nAnswer Gríma in your next message (it is relayed automatically). To end, write a final line \`${cfg.closeLine} <one-line verdict>\`. To talk to Gandalf instead, run \`covenant pause\` first.`;
    case 'closed-by-gpt':
      return `${head}\n\n${r.reply}\n\n---\nGríma closed the council with: "${r.verdict}". The council is closed and recorded (${m.id}). Give Gandalf a short summary of the outcome; nothing further is relayed.`;
    case 'cap':
      return `${head}\n\n${r.reply}\n\n---\nThe cap of ${m.cap} Gríma turns is reached; the council is closed and recorded (${m.id}). Give Gandalf a short summary of where it ended; nothing further is relayed.`;
    case 'paused':
      return `[Covenant · council ${m.id} PAUSED]\n\n${r.reason}\n\nTell Gandalf; \`covenant resume\` continues once it is fixed. Nothing is relayed while paused.`;
    default:
      return null;
  }
}

function loadConfigSafe(meta) {
  try {
    return cfgFor(meta);
  } catch {
    return { closeLine: 'COVENANT CLOSE:' };
  }
}

export function readMessageArg(flags) {
  if (flags['message-file']) return readFileSync(flags['message-file'], 'utf8');
  if (flags.message) return String(flags.message);
  return null;
}
