// The goal context: the sections of the pack and the lines of the named files that
// matter for THIS thread's goal, within a budget. The Navigator then reads the
// right 12 KB instead of searching the whole pack. Sent as the first message's
// attachment (`covenant context --clip`).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectOf } from './config.mjs';
import { appendEvent } from './ledger.mjs';

const STOP = new Set(['this', 'that', 'with', 'from', 'what', 'when', 'where', 'which', 'should', 'would', 'could', 'into', 'have', 'does', 'done', 'than', 'then', 'them', 'they', 'their', 'there', 'about', 'after', 'before', 'between', 'because', 'only', 'also', 'more', 'most', 'some', 'such', 'both', 'each', 'other', 'must', 'will', 'thread', 'goal', 'question', 'decide', 'decision', 'answer', 'reason']);

function words(text) {
  return [...new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

function sections(text, file) {
  const out = [];
  const parts = text.split(/\n(?=##+ )/);
  for (const part of parts) {
    const title = (part.match(/^##+ (.+)$/m) || [null, file])[1].trim();
    const body = part.trim();
    if (body.length > 80) out.push({ file, title, body });
  }
  return out;
}

export function buildGoalContext(dir, meta, { budget = 12000, perSection = 2500, perFile = 3000 } = {}) {
  const project = projectOf(meta);
  const q = words(`${meta.goal || ''} ${meta.question} ${(meta.contextPaths || []).join(' ')}`);
  const all = [];
  if (existsSync(project.filesDir)) {
    for (const f of readdirSync(project.filesDir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(project.filesDir, f), 'utf8');
      for (const s of sections(text, f)) {
        const lower = s.body.toLowerCase();
        const score = q.reduce((n, w) => n + (lower.includes(w) ? 1 + Math.min(3, (lower.split(w).length - 1) / 4) : 0), 0);
        if (score > 0) all.push({ ...s, score: score / Math.log2(s.body.length + 16) });
      }
    }
  }
  all.sort((a, b) => b.score - a.score);

  const out = [`# Goal context — ${meta.title}`, '', `Chosen by the Chief for this goal: ${meta.goal || meta.question}`, ''];
  let used = out.join('\n').length;
  const files = [];
  for (const rel of meta.contextPaths || []) {
    const p = join(project.repoRoot, rel);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split(/\r?\n/);
    let block = lines.slice(0, 120).map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n');
    if (block.length > perFile) block = block.slice(0, perFile) + '\n…(cut)';
    const chunk = `\n## ${rel} (first lines, numbered)\n\n\`\`\`\n${block}\n\`\`\`\n`;
    if (used + chunk.length > budget) break;
    out.push(chunk);
    used += chunk.length;
    files.push(rel);
  }
  const picked = [];
  for (const s of all) {
    const body = s.body.length > perSection ? s.body.slice(0, perSection) + '\n…(cut)' : s.body;
    const chunk = `\n## From ${s.file}: ${s.title}\n\n${body}\n`;
    if (used + chunk.length > budget) continue;
    out.push(chunk);
    used += chunk.length;
    picked.push(`${s.file} › ${s.title}`);
    if (picked.length >= 12) break;
  }
  const text = out.join('\n');
  const file = join(dir, 'context.md');
  writeFileSync(file, text);
  appendEvent(dir, { author: 'system', text: `goal context built: ${picked.length} sections, ${files.length} files, ${text.length} chars` });
  return { file, text, sections: picked, files, chars: text.length, queryWords: q };
}
