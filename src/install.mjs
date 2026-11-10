// `covenant install` / `covenant uninstall`: this machine's Claude Code wiring, run
// by the human. Everything it grants is listed in covenant.config.json → install, so
// it can be read and trimmed before running. Idempotent: running it twice adds nothing.
//
//   install   Stop hook → ~/.claude/settings.json (hook lanes)
//             allow rules → ~/.claude/settings.json → permissions.allow
//               (the browser tools the /covenant skill drives, and the Covenant CLI)
//             skills → ~/.claude/skills/covenant, ~/.claude/skills/covenant-setup ({{ROOT}} rendered)
//             agent  → ~/.claude/agents/covenant-watch.md
//             root   → ~/.covenant/config.json
//   uninstall removes exactly those, and nothing else in the files.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LOCAL, ROOT, loadConfig, saveLocalConfig } from './config.mjs';

const CLAUDE = join(homedir(), '.claude');
const SETTINGS = join(CLAUDE, 'settings.json');
const rootFwd = ROOT.replace(/\\/g, '/');
// Git Bash on Windows spells C:/x as /c/x; a rule for each form so both match.
const rootPosix = /^[A-Za-z]:\//.test(rootFwd) ? '/' + rootFwd[0].toLowerCase() + rootFwd.slice(2) : rootFwd;
const render = (s) => String(s).replaceAll('{{ROOT}}', rootFwd).replaceAll('{{ROOT_POSIX}}', rootPosix);
const readSettings = () => (existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {});
const writeSettings = (s) => {
  mkdirSync(CLAUDE, { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
};
const HOOK_MARK = 'claude-stop.mjs';

export function plannedRules({ browser = 'tools' } = {}) {
  const spec = loadConfig().install || {};
  const browserRules = browser === 'server' ? spec.allowBrowserServer || [] : spec.allowBrowserTools || [];
  const bashRules = (spec.allowBash || []).map((r) => `Bash(${render(r)})`);
  return [...browserRules, ...bashRules];
}

export function install({ browser = 'tools' } = {}) {
  const cfg = loadConfig();
  const report = { settings: SETTINGS, hook: null, allowAdded: [], allowPresent: [], skills: [], agents: [], local: LOCAL };
  const s = readSettings();

  // 1. the Stop hook (codex and browser lanes)
  s.hooks ??= {};
  s.hooks.Stop ??= [];
  const hasHook = s.hooks.Stop.some((g) => (g.hooks || []).some((h) => String(h.command || '').includes(HOOK_MARK)));
  if (!hasHook) s.hooks.Stop.push({ hooks: [{ type: 'command', command: `node "${rootFwd}/hooks/${HOOK_MARK}"`, timeout: Math.max(900, (cfg.browser?.replyTimeoutSeconds || 900) + 120) }] });
  report.hook = hasHook ? 'already present' : 'added';

  // 2. the allow rules the owner listed in covenant.config.json → install
  s.permissions ??= {};
  s.permissions.allow ??= [];
  for (const rule of plannedRules({ browser })) {
    if (s.permissions.allow.includes(rule)) report.allowPresent.push(rule);
    else {
      s.permissions.allow.push(rule);
      report.allowAdded.push(rule);
    }
  }
  writeSettings(s);

  // 3. the skills, with this checkout's path rendered in
  for (const name of readdirSync(join(ROOT, 'skills'))) {
    const src = join(ROOT, 'skills', name);
    if (!statSync(src).isDirectory()) continue;
    const dst = join(CLAUDE, 'skills', name);
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src)) writeFileSync(join(dst, f), render(readFileSync(join(src, f), 'utf8')));
    report.skills.push(dst);
  }

  // 4. Háma agent
  const agentsDst = join(CLAUDE, 'agents');
  mkdirSync(agentsDst, { recursive: true });
  for (const f of readdirSync(join(ROOT, 'agents'))) {
    copyFileSync(join(ROOT, 'agents', f), join(agentsDst, f));
    report.agents.push(join(agentsDst, f));
  }

  // 5. where this checkout is
  saveLocalConfig({ root: rootFwd });
  report.note = 'restart Claude Code sessions to load the skills, the agent and the rules';
  return report;
}

export function uninstall() {
  const report = { settings: SETTINGS, hookRemoved: false, allowRemoved: [], skillsRemoved: [], agentsRemoved: [] };
  if (existsSync(SETTINGS)) {
    const s = readSettings();
    if (s.hooks?.Stop) {
      const before = s.hooks.Stop.length;
      s.hooks.Stop = s.hooks.Stop.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes(HOOK_MARK)) })).filter((g) => g.hooks.length);
      report.hookRemoved = s.hooks.Stop.length !== before || true;
    }
    if (s.permissions?.allow) {
      const mine = new Set([...plannedRules({ browser: 'tools' }), ...plannedRules({ browser: 'server' })]);
      const keep = s.permissions.allow.filter((r) => !mine.has(r));
      report.allowRemoved = s.permissions.allow.filter((r) => mine.has(r));
      s.permissions.allow = keep;
    }
    writeSettings(s);
  }
  for (const name of ['covenant', 'covenant-setup']) {
    const p = join(CLAUDE, 'skills', name);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      report.skillsRemoved.push(p);
    }
  }
  for (const f of readdirSync(join(ROOT, 'agents'))) {
    const p = join(CLAUDE, 'agents', f);
    if (existsSync(p)) {
      rmSync(p, { force: true });
      report.agentsRemoved.push(p);
    }
  }
  return report;
}
