// Compile the brief the Navigator reads at the start of a thread. Order and budget
// are the point: goal → persona → owner → project brief → ledger (newest first) →
// history → this thread. Each part is cut to its budget; no part is dropped.
// `lean`: the ChatGPT project already carries persona, owner and project brief as
// its instructions and files, so only what changes per thread is sent.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeMemoryIndexFor, projectOf } from './config.mjs';

// HTML comments in the project files are notes to the owner, not to the Navigator.
const readOr = (p, fallback = '') => (existsSync(p) ? readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() : fallback);

export function cut(text, max, fromTop = false) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return fromTop ? '…\n' + t.slice(t.length - max) : t.slice(0, max) + '\n…(cut to budget)';
}

function ledgerNewestFirst(text) {
  const lines = text.split(/\r?\n/);
  const entries = lines.filter((l) => /^- /.test(l)).reverse();
  const head = lines.filter((l) => !/^- /.test(l) && l.trim()).slice(0, 2);
  return [...head, ...entries].join('\n');
}

function matchingMemoryLines(indexPath, question, max) {
  if (!indexPath || !existsSync(indexPath)) return '';
  const words = new Set(
    String(question)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
  if (!words.size) return '';
  const hits = readFileSync(indexPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('- '))
    .map((l) => ({ l, score: [...words].filter((w) => l.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.l);
  return cut(hits.join('\n'), max);
}

export function compileBrief(meta, { lean = false } = {}) {
  const project = projectOf(meta);
  const cfg = project.cfg;
  const B = cfg.briefBudgetChars;
  const p = project.dataDir;
  const parts = [];
  parts.push(`# The Covenant — thread "${meta.title}"`, '');
  if (meta.goal) parts.push('## Goal of this thread', '', meta.goal, '', 'The thread ends when this goal is met; say so with the close line when it is.', '');
  if (meta.mode === 'build') {
    parts.push(
      '## This is a build thread',
      '',
      'Phases: **requirements** (you list what done must satisfy; the Chief answers) → **plan** (the Chief proposes numbered steps with files and tests; you review until no blocker or major objection remains; then the Captain signs) → **execute** (the Chief does one step at a time and sends the evidence: the diff, the test output, a claim; you check it against the plan, in the codex lane by opening the files and running the tests yourself) → **done**.',
      '',
      'Every plan review and every step review ends with a fenced verdict block, exactly this shape:',
      '',
      '```verdict',
      '{"verdict":"agree","objections":[]}',
      '```',
      '',
      'or `{"verdict":"objections","objections":[{"id":"S2-1","severity":"blocker|major|minor","claim":"…","evidence":"path:line or test name","change":"…"}]}`. `agree` only when no blocker or major remains; a step is sent back at most twice, then the Captain decides.',
      '',
    );
  }
  if (lean) {
    parts.push('## How this works', '', `This is a Covenant thread: a dialogue with the Chief (Claude Code) about the project in this ChatGPT project. Your project instructions apply. Turn cap: ${meta.cap} replies from you. End it when the goal is met with a final line \`${cfg.closeLine} <one-line verdict>\`; the Chief can do the same.`, '');
  } else {
    parts.push('## How this works', '', cut(readOr(join(p, 'persona.md'), defaultPersona(cfg)), B.persona), '');
    const owner = readOr(join(p, 'owner.md'));
    if (owner) parts.push('## Who you are talking to', '', cut(owner, B.owner), '');
    const brief = readOr(join(p, 'brief.md'));
    if (brief) parts.push('## The project', '', cut(brief, B.brief), '');
  }
  const ledger = readOr(join(p, 'ledger.md'));
  if (ledger && /^- /m.test(ledger)) parts.push('## What the Covenant already settled (newest first)', '', cut(ledgerNewestFirst(ledger), B.ledger), '');
  const history = readOr(join(p, 'history.md'));
  if (history) parts.push('## What you and the owner settled before the Covenant', '', cut(history, B.history), '');
  const thread = [`**Question:** ${meta.question}`];
  if (meta.contextPaths?.length) thread.push('', '**Files the Chief names as relevant** (paths in the repo):', ...meta.contextPaths.map((f) => `- \`${f}\``));
  const mem = matchingMemoryLines(cfg.claudeMemoryIndex || claudeMemoryIndexFor(project.repoRoot), `${meta.goal || ''} ${meta.question}`, Math.floor(B.thread / 2));
  if (mem) thread.push('', "**From the Chief's memory index** (things Claude knows that you may not):", mem);
  parts.push('## This thread', '', cut(thread.join('\n'), B.thread), '');
  if (!lean) parts.push(`Turn cap: ${meta.cap} replies from you. End the thread when the goal is met with a final line \`${cfg.closeLine} <one-line verdict>\`. The Chief can do the same.`, '');
  return parts.join('\n');
}

export function defaultPersona(cfg) {
  return [
    'You are the Navigator in the Covenant: a recorded dialogue with the Chief (Claude Code, working inside a real codebase with tools). The Captain (the owner) reads the transcript afterwards and decides. You are the second mind, not the second vote.',
    '',
    '- Think first, read second: write your own answer under "My take" before weighing the Chief\'s under "On the Chief\'s position".',
    '- Argue from evidence; when you do not know, ask the Chief to quote the code with the path.',
    '- Say where you differ and why; agreement is earned by evidence. Inventing objections is a failure in the same way a rubber stamp is.',
    '- Widen the frame once: one angle nobody raised, or "No better angle".',
    '- One recommendation, plain language, under ~400 words.',
    '- A message marked "From the Captain" overrides both of us: answer it first.',
    '- End every reply with: STANCE: hold | moved: <what> | agree  and  CONFIDENCE: low | medium | high',
    `- When the goal is met, end with the line \`${cfg.closeLine} <one-line verdict>\`.`,
  ].join('\n');
}
