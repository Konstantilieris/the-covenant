#!/usr/bin/env node
// `covenant-setup` — the one-word install for the repo you are in.
//
//   covenant-setup [--project-url URL] [--browser tools|server] [--no-commit] [--cwd REPO]
//
// Same as `covenant setup`: marker + data dir (named after the repo folder), launcher,
// skills, Háma agent, allow rules, Stop hook, gitignore line, pack, doctor report,
// and a --only commit on the current branch. Prints a human summary, then the JSON.
import { resolve } from 'node:path';
import { setup } from '../src/setup.mjs';

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) flags[k] = true;
  else {
    flags[k] = v;
    i++;
  }
}

try {
  const r = setup({
    cwd: flags.cwd && flags.cwd !== true ? resolve(String(flags.cwd)) : process.cwd(),
    project: flags.project && flags.project !== true ? String(flags.project) : undefined,
    projectUrl: flags['project-url'] && flags['project-url'] !== true ? String(flags['project-url']) : undefined,
    browser: flags.browser === 'server' ? 'server' : 'tools',
    commit: !flags['no-commit'],
  });
  const lines = ['The Covenant is wired for this repo.', ''];
  for (const s of r.steps) {
    const { step, ...rest } = s;
    lines.push(`  ${step.padEnd(12)} ${summarize(rest)}`);
  }
  lines.push('', r.doctor.ok ? '  doctor       all checks pass' : `  doctor       ${r.doctor.missing.length} to fix:`);
  for (const m of r.doctor.missing) lines.push(`               - ${m}`);
  lines.push('', 'Next:');
  for (const n of r.next) lines.push(`  - ${n}`);
  console.log(lines.join('\n'));
  console.log('\n' + JSON.stringify(r, null, 2));
} catch (e) {
  console.error(`covenant-setup: ${e.message}`);
  process.exit(1);
}

function summarize(o) {
  return Object.entries(o)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : typeof v === 'object' && v ? JSON.stringify(v).slice(0, 80) : String(v)}`)
    .join('; ');
}
