#!/usr/bin/env node
// tools/covenant.mjs — the Covenant launcher for this repo.
//
// Runs the Covenant CLI (https://github.com/Konstantilieris/the-covenant) against
// this repository, fetching the Covenant into ../the-covenant the first time if it
// is not on this machine. Everything else the Covenant needs here (skills, the Watch
// agent, allow rules, the Stop hook) lives in this repo's .claude/, so cloning the
// repo is the install.
//
//   node tools/covenant.mjs doctor
//   node tools/covenant.mjs open --title … --goal … --question …
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = 'https://github.com/Konstantilieris/the-covenant.git';
const local = join(homedir(), '.covenant', 'config.json');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) {
    console.error(`covenant: ${cmd} ${args.join(' ')} failed`);
    process.exit(r.status ?? 1);
  }
}

function candidates() {
  const c = [];
  if (process.env.COVENANT_ROOT) c.push(process.env.COVENANT_ROOT);
  try {
    const j = JSON.parse(readFileSync(local, 'utf8'));
    if (j.root) c.push(j.root);
  } catch {}
  c.push(resolve(repoRoot, '..', 'the-covenant'), join(homedir(), 'the-covenant'));
  return c;
}

let root = candidates().find((p) => existsSync(join(p, 'bin', 'covenant.mjs')));
if (!root) {
  root = resolve(repoRoot, '..', 'the-covenant');
  console.error(`covenant: fetching the Covenant into ${root} …`);
  run('git', ['clone', '--depth', '1', REPO_URL, root]);
}
if (!existsSync(join(root, 'node_modules'))) run('npm', ['install', '--no-audit', '--no-fund'], { cwd: root });

try {
  mkdirSync(dirname(local), { recursive: true });
  const j = existsSync(local) ? JSON.parse(readFileSync(local, 'utf8')) : {};
  const fwd = root.replace(/\\/g, '/');
  if (j.root !== fwd) {
    j.root = fwd;
    writeFileSync(local, JSON.stringify(j, null, 2) + '\n');
  }
} catch {}

const args = process.argv.slice(2);
if (!args.includes('--cwd')) args.push('--cwd', repoRoot);
const r = spawnSync(process.execPath, [join(root, 'bin', 'covenant.mjs'), ...args], { stdio: 'inherit', cwd: repoRoot });
process.exit(r.status ?? 1);
