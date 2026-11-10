// Paths and configuration.
//
// The Covenant is a generic tool. It learns which codebase it works for from where
// it runs: the git root of the working directory must hold `.covenant.json`
// ({ "project": "<name>", "dir": "docs/covenant" }), and that data dir holds the
// project's persona, owner notes, brief, history, pack spec, ledger and threads.
//
// Layers of settings: tool defaults ← <covenant>/covenant.config.json (generic) ←
// <repo>/.covenant.json (shared with the team) ← ~/.covenant/config.json
// (this machine: projects.<name>.projectUrl, adapter, …).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// COVENANT_HOME lets tests (and a locked-down machine) keep state away from ~/.covenant.
export const HOME = process.env.COVENANT_HOME || join(homedir(), '.covenant');
export const SESSIONS = join(HOME, 'sessions');
export const TEMPLATE = join(ROOT, 'template');
export const LOCAL = join(HOME, 'config.json');
for (const d of [HOME, SESSIONS]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const defaults = {
  adapter: 'extension', // extension | codex | browser | openai
  buildAdapter: 'codex', // build threads: the Navigator reviews execution with the repo in front of it
  buildCap: 20,
  openai: { model: 'gpt-5.1', reasoning: 'medium', baseUrl: 'https://api.openai.com/v1' },
  dataDir: 'docs/covenant',
  cap: 8,
  minMessageChars: 20,
  closeLine: 'COVENANT CLOSE:',
  blindFirstTake: true,
  maxThreadHours: 6,
  watch: { model: 'haiku', exchanges: 3, required: true },
  pushAtClose: true, // pushes the codebase's current branch; never main/master
  pace: { minSecondsBetweenSends: 20, dailySendCap: 60 }, // extension lane cadence (see src/pace.mjs)
  browser: { port: 4848, profileDir: '.chrome-profile', projectUrl: null, minSecondsBetweenSends: 20, dailySendCap: 60, replyTimeoutSeconds: 900 },
  codex: { model: null, effort: 'medium' },
  briefBudgetChars: { persona: 2000, owner: 2000, brief: 6000, ledger: 4000, history: 6000, thread: 4000 },
  claudeMemoryIndex: null, // derived from the repo path when null
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base?.[k] || {}, v) : v;
  }
  return out;
}

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});

export function loadLocal() {
  return readJson(LOCAL);
}

export function saveLocalConfig(patch) {
  const next = merge(loadLocal(), patch);
  writeFileSync(LOCAL, JSON.stringify(next, null, 2) + '\n');
  return LOCAL;
}

// Tool-level settings (no project): defaults ← covenant.config.json ← local (minus projects).
export function loadConfig() {
  const { projects: _p, ...local } = loadLocal();
  return merge(merge(defaults, readJson(join(ROOT, 'covenant.config.json'))), local);
}

export function gitRoot(cwd) {
  try {
    return resolve(execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    return null;
  }
}

// "owner/name" from the origin remote (GitHub https or ssh), or null.
export function repoSlug(repoRoot) {
  try {
    const url = execFileSync('git', ['-C', repoRoot, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function gitBranch(repoRoot) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function findMarker(cwd = process.cwd()) {
  const root = gitRoot(cwd);
  if (!root) return null;
  const path = join(root, '.covenant.json');
  return { root, path, marker: existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null };
}

// The project the working directory belongs to.
export function resolveProject(cwd = process.cwd()) {
  const found = findMarker(cwd);
  if (!found) throw new Error(`${cwd} is not inside a git repository`);
  if (!found.marker) throw new Error(`no .covenant.json at ${found.root} — run \`covenant init --project <name>\` there (or /covenant-setup)`);
  const name = found.marker.project;
  if (!name) throw new Error(`${found.path} has no "project" name`);
  const local = loadLocal();
  const cfg = merge(merge(loadConfig(), found.marker), (local.projects || {})[name] || {});
  const dataDir = resolve(found.root, found.marker.dir || cfg.dataDir);
  return { name, repoRoot: found.root, dataDir, threadsDir: join(dataDir, 'threads'), filesDir: join(dataDir, 'files'), markerPath: found.path, cfg };
}

// Same, from a thread's recorded repo (so record/outgoing work from any cwd).
export function projectOf(meta) {
  try {
    return resolveProject(meta.repoRoot || meta.cwd || process.cwd());
  } catch {
    return { name: meta.project, repoRoot: meta.repoRoot, dataDir: meta.dataDir, threadsDir: join(meta.dataDir, 'threads'), filesDir: join(meta.dataDir, 'files'), cfg: loadConfig() };
  }
}

// Claude Code keeps per-project memory under ~/.claude/projects/<path with : \ / → ->/memory/.
export function claudeMemoryIndexFor(repoRoot) {
  return join(homedir(), '.claude', 'projects', String(repoRoot).replace(/[:\\/]/g, '-'), 'memory', 'MEMORY.md');
}

export function nowIso() {
  return new Date().toISOString();
}
