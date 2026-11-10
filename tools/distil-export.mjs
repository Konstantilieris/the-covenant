#!/usr/bin/env node
// Pull the conversations about your project out of a ChatGPT data export.
//
//   node tools/distil-export.mjs import/conversations.json --keywords a,b,c [--out import/conversations.md]
//
// Writes one markdown file with every matching conversation in order (title, date,
// each message), for the Chief to distil into docs/covenant/history.md.
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else pos.push(argv[i]);
}
const file = pos[0];
if (!file) {
  console.error('usage: distil-export.mjs <conversations.json> [--keywords a,b] [--out file.md]');
  process.exit(1);
}
if (!flags.keywords) {
  console.error('--keywords <a,b,c> is required: words that mark a conversation as being about your project (its name, stack, issue prefix)');
  process.exit(1);
}
const keywords = String(flags.keywords).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
const outPath = flags.out || 'import/conversations.md';
const MAX_MSG = 4000;

const data = JSON.parse(readFileSync(file, 'utf8'));
const convs = Array.isArray(data) ? data : data.conversations || [];

function linearize(conv) {
  const mapping = conv.mapping || {};
  const chain = [];
  let id = conv.current_node;
  while (id && mapping[id]) {
    chain.push(mapping[id]);
    id = mapping[id].parent;
  }
  chain.reverse();
  const msgs = [];
  for (const node of chain) {
    const m = node.message;
    if (!m || !m.author) continue;
    const role = m.author.role;
    if (role === 'system' || role === 'tool') continue;
    const parts = (m.content?.parts || []).map((p) => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean);
    const text = parts.join('\n').trim();
    if (!text) continue;
    msgs.push({ role, text, time: m.create_time });
  }
  return msgs;
}

const date = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '????-??-??');
const matches = (conv, msgs) => {
  const hay = (conv.title + '\n' + msgs.map((m) => m.text).join('\n')).toLowerCase();
  return keywords.some((k) => hay.includes(k));
};

const picked = [];
for (const conv of convs) {
  const msgs = linearize(conv);
  if (msgs.length && matches(conv, msgs)) picked.push({ conv, msgs });
}
picked.sort((a, b) => (a.conv.create_time || 0) - (b.conv.create_time || 0));

const lines = [`# ChatGPT export — ${picked.length} of ${convs.length} conversations match [${keywords.join(', ')}]`, ''];
for (const { conv, msgs } of picked) {
  lines.push(`## ${date(conv.create_time)} — ${conv.title || '(untitled)'}`, '');
  for (const m of msgs) {
    const t = m.text.length > MAX_MSG ? m.text.slice(0, MAX_MSG) + '\n…(cut)' : m.text;
    lines.push(`**${m.role}** (${date(m.time)}):`, '', t, '');
  }
  lines.push('---', '');
}
writeFileSync(outPath, lines.join('\n'));
console.log(`${picked.length}/${convs.length} conversations → ${outPath} (${Math.round(lines.join('\n').length / 1024)} KB)`);
