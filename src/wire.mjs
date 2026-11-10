// `covenant wire`: put the Covenant's wiring INTO a repo as ordinary project files,
// so cloning the repo is the install and nothing has to be written to ~/.claude:
//
//   <repo>/tools/covenant.mjs                     the launcher (fetches the Covenant if missing)
//   <repo>/.claude/skills/covenant/*              the /covenant skill, CLI = node tools/covenant.mjs
//   <repo>/.claude/skills/covenant-setup/SKILL.md
//   <repo>/.claude/agents/covenant-watch.md       Háma
//   <repo>/.claude/settings.json                  permissions.allow for the browser tools and the
//                                                 launcher, and the Stop hook (merged, idempotent)
//
// Project skills, agents, hooks and permission rules are read by Claude Code from the
// repo's .claude/ once the folder is trusted. The rule list is covenant.config.json → install.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, TEMPLATE, loadConfig } from './config.mjs';

const LAUNCHER = 'node tools/covenant.mjs';

export function wire(repoRoot, { browser = 'tools' } = {}) {
  const cfg = loadConfig();
  const spec = cfg.install || {};
  const report = { repo: repoRoot, written: [], settings: null, allowAdded: [], hook: null };
  const put = (rel, text) => {
    const p = join(repoRoot, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
    report.written.push(rel);
  };

  put('tools/covenant.mjs', readFileSync(join(TEMPLATE, 'launcher.mjs'), 'utf8'));

  for (const name of readdirSync(join(ROOT, 'skills'))) {
    const src = join(ROOT, 'skills', name);
    for (const f of readdirSync(src)) {
      const text = readFileSync(join(src, f), 'utf8').replaceAll('node {{ROOT}}/bin/covenant.mjs', LAUNCHER).replaceAll('{{ROOT}}', '<the Covenant checkout>');
      put(`.claude/skills/${name}/${f}`, text);
    }
  }
  for (const f of readdirSync(join(ROOT, 'agents'))) put(`.claude/agents/${f}`, readFileSync(join(ROOT, 'agents', f), 'utf8'));

  const settingsPath = join(repoRoot, '.claude', 'settings.json');
  const s = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
  s.permissions ??= {};
  s.permissions.allow ??= [];
  const rules = [...(browser === 'server' ? spec.allowBrowserServer || [] : spec.allowBrowserTools || []), `Bash(${LAUNCHER}:*)`, 'Bash(covenant:*)', 'Bash(covenant-setup:*)'];
  for (const r of rules) {
    if (!s.permissions.allow.includes(r)) {
      s.permissions.allow.push(r);
      report.allowAdded.push(r);
    }
  }
  s.hooks ??= {};
  s.hooks.Stop ??= [];
  const hasHook = s.hooks.Stop.some((g) => (g.hooks || []).some((h) => String(h.command || '').includes('covenant.mjs stop-hook')));
  if (!hasHook) s.hooks.Stop.push({ hooks: [{ type: 'command', command: `${LAUNCHER} stop-hook`, timeout: Math.max(900, (cfg.browser?.replyTimeoutSeconds || 900) + 120) }] });
  report.hook = hasHook ? 'already present' : 'added';
  mkdirSync(join(repoRoot, '.claude'), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
  report.settings = settingsPath;
  report.note = 'commit tools/covenant.mjs and .claude/; teammates get the wiring by cloning. Restart Claude Code to load the skills and the agent.';
  return report;
}
