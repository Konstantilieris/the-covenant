// `covenant doctor`: what this machine and this repo have, and what is missing.
// The browser-side checks (extension connected, ChatGPT logged in, project sources
// present) can only be made from inside Claude Code; the setup skill does those.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { HOME, LOCAL, ROOT, findMarker, gitBranch, loadLocal, resolveProject } from './config.mjs';
import { listThreads } from './ledger.mjs';
import { packInfo } from './pack.mjs';
import { plannedRules } from './install.mjs';

// A shell only for the .cmd shims on Windows (codex, powershell); git and node run direct.
const sh = (cmd, args, opts = {}) => {
  try {
    const shell = process.platform === 'win32' && ['codex', 'powershell', 'npm'].includes(cmd);
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, shell, ...opts }).trim();
  } catch {
    return null;
  }
};

export function doctor({ cwd = process.cwd(), clipboard = true } = {}) {
  const checks = [];
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail, ...(ok ? {} : { fix }) });

  // --- machine
  const node = process.versions.node;
  add('node', Number(node.split('.')[0]) >= 22, `node ${node}`, 'install Node 22 or newer');
  const git = sh('git', ['--version']);
  add('git', !!git, git || 'git not found', 'install git');

  // --- the repo we are in, and its wiring (project-level .claude/, delivered by git);
  //     the user-level install (~/.claude) counts too.
  const found = findMarker(cwd);
  add('inside a git repo', !!found, found ? found.root : `${cwd} is not in a git repository`, 'cd into the codebase');
  const claudeDir = join(homedir(), '.claude');
  const projClaude = found ? join(found.root, '.claude') : null;
  const where = (rel) => (projClaude && existsSync(join(projClaude, rel)) ? 'repo' : existsSync(join(claudeDir, rel)) ? 'user' : null);
  const launcher = found && existsSync(join(found.root, 'tools', 'covenant.mjs'));
  add('launcher tools/covenant.mjs', !!launcher, launcher ? 'present' : 'absent', 'run: covenant wire (or init)');
  const sk = where('skills/covenant/SKILL.md');
  add('skill /covenant', !!sk, sk ? `${sk}-level` : 'not installed', 'run: covenant wire (repo) or covenant install (user)');
  const sk2 = where('skills/covenant-setup/SKILL.md');
  add('skill /covenant-setup', !!sk2, sk2 ? `${sk2}-level` : 'not installed', 'run: covenant wire (repo) or covenant install (user)');
  const ag = where('agents/covenant-watch.md');
  add('agent covenant-watch', !!ag, ag ? `${ag}-level` : 'not installed', 'run: covenant wire (repo) or covenant install (user)');
  const readAllow = (p) => {
    try {
      const s = JSON.parse(readFileSync(p, 'utf8'));
      return { allow: s.permissions?.allow || [], hook: (s.hooks?.Stop || []).some((g) => (g.hooks || []).some((h) => /claude-stop\.mjs|covenant\.mjs stop-hook/.test(String(h.command || '')))) };
    } catch {
      return { allow: [], hook: false };
    }
  };
  const proj = projClaude ? readAllow(join(projClaude, 'settings.json')) : { allow: [], hook: false };
  const user = readAllow(join(claudeDir, 'settings.json'));
  const allow = [...proj.allow, ...user.allow];
  add('stop hook (codex/browser lanes)', proj.hook || user.hook, proj.hook ? 'repo-level' : user.hook ? 'user-level' : 'absent', 'run: covenant wire or covenant install (only the codex or browser lane needs it)');
  const planned = plannedRules({ browser: 'tools' });
  const browserRules = planned.filter((r) => r.startsWith('mcp__'));
  const browserOk = plannedRules({ browser: 'server' }).some((r) => allow.includes(r)) || browserRules.every((r) => allow.includes(r));
  const cliOk = allow.includes('Bash(node tools/covenant.mjs:*)') || planned.filter((r) => r.startsWith('Bash(')).every((r) => allow.includes(r));
  add('allow rules: browser tools', browserOk, browserOk ? `present (${proj.allow.some((r) => r.includes('claude-in-chrome')) ? 'repo' : 'user'}-level)` : `${allow.filter((r) => r.includes('claude-in-chrome')).length} of ${browserRules.length} present`, 'run: covenant wire or covenant install');
  add('allow rules: covenant cli', cliOk, cliOk ? 'present' : 'absent', 'run: covenant wire or covenant install');
  const local = loadLocal();
  add('local config', existsSync(LOCAL), existsSync(LOCAL) ? LOCAL : 'none yet', 'created by the launcher / covenant project / covenant config');
  let project = null;
  if (found) {
    add('.covenant.json', !!found.marker, found.marker ? `${found.path} → project "${found.marker.project}"` : `missing at ${found.root}`, 'run: covenant init --project <name>');
    if (found.marker) {
      try {
        project = resolveProject(cwd);
      } catch (e) {
        add('project', false, e.message, 'fix .covenant.json');
      }
    }
  }
  if (project) {
    for (const f of ['persona.md', 'brief.md']) add(`data ${f}`, existsSync(join(project.dataDir, f)), existsSync(join(project.dataDir, f)) ? join(project.dataDir, f) : 'missing', 'run: covenant init, then edit it');
    for (const f of ['owner.md', 'history.md']) if (!existsSync(join(project.dataDir, f)) || !readFileSync(join(project.dataDir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim()) checks.push({ name: `data ${f}`, ok: true, detail: 'empty (optional)' });
    const instr = ['persona.md', 'owner.md'].map((f) => (existsSync(join(project.dataDir, f)) ? readFileSync(join(project.dataDir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() : '')).join('\n\n').length;
    add('instructions length', instr <= 5000, `${instr} chars (ChatGPT project instructions allow about 5000)`, 'shorten persona.md or owner.md');
    const spec = join(project.dataDir, 'pack.json');
    add('pack.json', existsSync(spec), existsSync(spec) ? spec : 'missing', 'run: covenant init');
    const built = packInfo(project);
    // "moved on" means a commit that touched something other than the Covenant's own
    // files; the setup commit that follows a pack build must not count.
    const dataRel = relative(project.repoRoot, project.dataDir).replace(/\\/g, '/');
    const head = sh('git', ['-C', project.repoRoot, 'log', '-1', '--format=%cI', '--', '.', `:!${dataRel}`, ':!tools/covenant.mjs', ':!.claude', ':!.covenant.json', ':!.gitignore']);
    const stale = built && head && Date.parse(head) > Date.parse(built.at);
    add('pack built', !!built && !stale, built ? `${built.files.length} files, built ${built.at}${stale ? `, repo moved on at ${head}` : ''}` : 'never built', built ? 'run: covenant pack, then refresh the Sources' : 'run: covenant pack');
    const lane = project.cfg.adapter;
    add('lane', ['extension', 'codex', 'browser'].includes(lane), `${lane}`, 'set adapter in .covenant.json or covenant config --set projects.<name>.adapter=…');
    if (lane === 'extension') add('project URL', !!project.cfg.browser?.projectUrl, project.cfg.browser?.projectUrl || 'not set for this machine', 'run: covenant project --url <ChatGPT project URL>');
    if (lane === 'extension') checks.push({ name: 'extension + ChatGPT login', ok: true, detail: 'checked by the skill from inside Claude Code (tabs_context_mcp, chatgpt.com)' });
    if (lane === 'codex' || project.cfg.buildAdapter === 'codex') {
      const v = sh('codex', ['--version']);
      add('codex cli (codex lane; build threads)', !!v, v || 'codex not found', 'npm i -g @openai/codex && codex login');
    }
    if (lane === 'openai') add('openai key (api lane)', !!(process.env.OPENAI_API_KEY || local.openai?.apiKey), process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY set' : local.openai?.apiKey ? 'in ~/.covenant/config.json' : 'absent', 'set OPENAI_API_KEY or covenant config --set openai.apiKey=…');
    const branch = gitBranch(project.repoRoot);
    add('branch', !!branch && !['main', 'master'].includes(branch), `on ${branch}`, 'threads commit to the current branch; never main — switch branch');
    const threads = listThreads(project.threadsDir);
    const open = threads.filter((t) => t.meta.state === 'open');
    const paused = threads.filter((t) => t.meta.state === 'paused');
    add('threads', open.length <= 1, `${threads.length} total, ${open.length} open, ${paused.length} paused${paused.length ? ` (${paused.map((t) => t.meta.id).join(', ')})` : ''}`, 'close or stop the extra open thread');
  }

  // --- slack mirror (optional): a CLI path the project names in .covenant.json → slack.cli
  const slackCli = project?.cfg?.slack?.cli ? resolve(project.repoRoot, project.cfg.slack.cli) : null;
  checks.push({ name: 'slack mirror (optional)', ok: true, detail: slackCli && existsSync(slackCli) ? `cli at ${slackCli}` : 'not configured; mirror stays off' });

  // --- clipboard round trip
  if (clipboard) {
    let ok = false;
    try {
      const token = `covenant-doctor-${Date.now()}`;
      if (process.platform === 'win32') {
        sh('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Value '${token}'`]);
        ok = (sh('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw']) || '').includes(token);
      } else ok = true;
    } catch {}
    add('clipboard', ok, ok ? 'round trip ok' : 'clipboard not working', 'the extension lane pastes from the clipboard; check PowerShell / xclip');
  }

  return { ok: checks.every((c) => c.ok), covenant: ROOT, home: HOME, checks };
}
