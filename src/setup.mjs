// `covenant setup --project NAME [--cwd REPO] [--project-url URL] [--browser tools|server] [--no-commit]`
//
// One command for a repo: marker + data dir (init), the wiring as project files
// (wire), the gitignore line for the derived pack, this machine's ChatGPT project
// URL, the context pack, a doctor report, and a `--only` commit of the Covenant
// files on the current branch (never main). Idempotent: re-running adds nothing
// twice. The ChatGPT project itself is created by the /covenant-setup skill in the
// browser; pass its URL here once you have it.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { TEMPLATE, findMarker, gitBranch, loadConfig, repoSlug, resolveProject, saveLocalConfig } from './config.mjs';
import { doctor } from './doctor.mjs';
import { buildPack } from './pack.mjs';
import { wire } from './wire.mjs';

export function setup({ cwd = process.cwd(), project: name, dir, projectUrl, browser = 'tools', commit = true } = {}) {
  const report = { steps: [] };
  const step = (what, result) => report.steps.push({ step: what, ...result });

  const found = findMarker(cwd);
  if (!found) throw new Error(`${cwd} is not inside a git repository`);
  const repoRoot = found.root;

  // 1. marker + data dir. The project is named after the repo folder unless told otherwise.
  const dataRel = dir || found.marker?.dir || loadConfig().dataDir;
  const dataDir = resolve(repoRoot, dataRel);
  const projectName = found.marker?.project || name || basename(repoRoot);
  if (!found.marker) writeFileSync(found.path, JSON.stringify({ project: projectName, dir: dataRel }, null, 2) + '\n');
  mkdirSync(join(dataDir, 'threads'), { recursive: true });
  const created = [];
  const slug = repoSlug(repoRoot) || basename(repoRoot);
  for (const f of readdirSync(TEMPLATE)) {
    if (f === 'launcher.mjs') continue;
    const dst = join(dataDir, f);
    if (existsSync(dst)) continue;
    writeFileSync(dst, readFileSync(join(TEMPLATE, f), 'utf8').replaceAll('{{PROJECT}}', projectName).replaceAll('{{REPO}}', slug));
    created.push(f);
  }
  // A persona edited by hand may still carry the placeholder; fill it (idempotent).
  const personaPath = join(dataDir, 'persona.md');
  if (existsSync(personaPath) && readFileSync(personaPath, 'utf8').includes('{{REPO}}')) {
    writeFileSync(personaPath, readFileSync(personaPath, 'utf8').replaceAll('{{REPO}}', slug).replaceAll('{{PROJECT}}', projectName));
    created.push('persona.md (repo name filled)');
  }
  if (!existsSync(join(dataDir, 'ledger.md'))) {
    writeFileSync(join(dataDir, 'ledger.md'), `# Covenant ledger — ${projectName}\n\nOne line per closed thread, oldest first.\n\n`);
    created.push('ledger.md');
  }
  step('init', { marker: found.path, existed: !!found.marker, dataDir, created });

  // 2. the wiring as project files
  step('wire', wire(repoRoot, { browser }));

  // 3. the derived pack is not committed
  const gi = join(repoRoot, '.gitignore');
  const line = `${dataRel.replace(/\\/g, '/').replace(/\/$/, '')}/files/`;
  const giText = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  if (!giText.split(/\r?\n/).includes(line)) {
    appendFileSync(gi, `${giText.endsWith('\n') || !giText ? '' : '\n'}\n# Covenant context pack (derived; rebuilt with node tools/covenant.mjs pack)\n${line}\n`);
    step('gitignore', { added: line });
  } else step('gitignore', { present: line });

  // 4. this machine's ChatGPT project
  if (projectUrl) step('project url', { saved: saveLocalConfig({ projects: { [projectName]: { browser: { projectUrl } } } }), projectUrl });

  // 5. the pack
  try {
    const p = resolveProject(repoRoot);
    const built = buildPack(p);
    step('pack', { files: built.written.map((w) => `${w.file} (${w.kb} KB)`) });
  } catch (e) {
    step('pack', { skipped: e.message });
  }

  // 6. commit the Covenant files only, on the current branch
  if (commit) {
    const branch = gitBranch(repoRoot);
    if (!branch || ['main', 'master'].includes(branch)) step('commit', { skipped: `on ${branch || '?'}: commit from a feature branch` });
    else {
      const paths = [relative(repoRoot, found.path), dataRel, 'tools/covenant.mjs', '.claude/settings.json', '.claude/skills/covenant', '.claude/skills/covenant-setup', '.claude/agents/covenant-watch.md', '.gitignore'].map((p) => p.replace(/\\/g, '/'));
      const git = (...a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      try {
        git('add', ...paths);
        const staged = git('diff', '--cached', '--name-only', '--', ...paths).trim();
        if (!staged) step('commit', { skipped: 'nothing new to commit' });
        else {
          git('commit', '-q', '--only', ...paths, '-m', `chore(covenant): wire the Covenant for ${projectName}`);
          step('commit', { branch, files: staged.split('\n').length, note: 'not pushed; push when you are ready' });
        }
      } catch (e) {
        step('commit', { failed: String(e.stderr || e.message).trim().split('\n')[0] });
      }
    }
  }

  // 7. the report
  const d = doctor({ cwd: repoRoot, clipboard: false });
  report.doctor = { ok: d.ok, missing: d.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail} → ${c.fix}`) };
  report.next = [
    'restart Claude Code in this repo (the skills, the agent and the rules load at startup)',
    projectUrl ? 'add the pack files to the ChatGPT project: /covenant-setup does it (Sources → Paste text)' : 'create the ChatGPT project: /covenant-setup does it through the extension, then it stores the URL',
    'edit docs/covenant/persona.md, owner.md, brief.md to taste; node tools/covenant.mjs instructions --clip gives the project instructions',
    'git push when ready',
  ];
  return report;
}
