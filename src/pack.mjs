// Build the context pack for a ChatGPT project: a handful of markdown bundles under
// <dataDir>/files/, assembled from the codebase per <dataDir>/pack.json. Re-run it
// whenever the repo moved on; refresh the project's Sources with the changed files.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './config.mjs';

const MAX_SOURCE_CHARS = 40_000;

export function buildPack(project, { repo: repoOverride } = {}) {
  const specPath = join(project.dataDir, 'pack.json');
  if (!existsSync(specPath)) throw new Error(`no ${specPath} — run \`covenant init\` or write one (see template/pack.json)`);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const repo = repoOverride || project.repoRoot;
  if (!existsSync(repo)) throw new Error(`repo not found: ${repo}`);
  const out = project.filesDir;
  mkdirSync(out, { recursive: true });
  const stamp = `<!-- Covenant context pack · ${project.name} · built ${nowIso()} -->\n`;
  const written = [];

  const readRepo = (rel) => {
    const p = join(repo, rel);
    return existsSync(p) && statSync(p).isFile() ? readFileSync(p, 'utf8') : null;
  };
  const clip = (t) => (t.length > MAX_SOURCE_CHARS ? t.slice(0, MAX_SOURCE_CHARS) + '\n\n…(cut: source longer than the pack allows)' : t);

  for (const b of spec.bundles) {
    const entries = [];
    for (const src of b.sources) {
      if (src.file) entries.push({ label: src.file, text: readRepo(src.file) });
      else if (src.project) {
        const p = join(project.dataDir, src.project);
        entries.push({ label: src.project, text: existsSync(p) ? readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '') : null });
      } else if (src.dir) {
        let files = listFiles(repo, src.dir, new RegExp(src.match || '.'), !!src.recursive).sort();
        if (src.latest) files = files.slice(-src.latest);
        for (const f of files) entries.push({ label: f, text: readRepo(f) });
      } else if (src.tree) entries.push({ label: `Repository map (${src.tree.depth} levels, directories only)`, text: tree(repo, src.tree) });
    }
    const parts = [stamp, `# ${b.title}\n`];
    let n = 0;
    for (const e of entries) {
      if (e.text == null || !e.text.trim()) continue;
      n++;
      parts.push(`\n\n---\n\n## ${e.label}\n\n${clip(e.text.trim())}\n`);
    }
    if (!n) continue;
    const p = join(out, b.file);
    writeFileSync(p, parts.join(''));
    written.push({ file: b.file, kb: Math.round(statSync(p).size / 1024), sources: n });
  }
  writeFileSync(join(out, '.built'), JSON.stringify({ at: nowIso(), repo, files: written }, null, 2));
  return { out, written };
}

export function packInfo(project) {
  const p = join(project.filesDir, '.built');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function listFiles(repo, relDir, match, recursive) {
  const abs = join(repo, relDir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${relDir.replace(/\\/g, '/').replace(/\/$/, '')}/${entry.name}`;
    if (entry.isDirectory()) {
      if (recursive && !/^(node_modules|dist|\.git|\.next|coverage)$/.test(entry.name)) out.push(...listFiles(repo, rel, match, true));
    } else if (match.test(entry.name)) out.push(rel);
  }
  return out;
}

function tree(repo, { depth = 2, ignore = [] }) {
  const skip = new Set(['node_modules', 'dist', '.git', '.next', 'coverage', '.turbo', ...ignore]);
  const lines = [];
  const walk = (dir, level, prefix) => {
    if (level > depth || lines.length > 600) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !skip.has(e.name) && !e.name.startsWith('.'));
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`${prefix}${e.name}/`);
      walk(join(dir, e.name), level + 1, prefix + '  ');
    }
  };
  walk(repo, 1, '');
  return '```\n' + lines.join('\n') + '\n```';
}
