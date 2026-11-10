#!/usr/bin/env node
// The Covenant CLI. Run it from inside the codebase (or pass --cwd): the git root
// must hold .covenant.json, which names the project and its data dir.
//
//   covenant setup [--project NAME] [--cwd REPO] [--project-url URL] [--browser tools|server] [--no-commit]
//                                                            init + wire + gitignore + pack + doctor + commit, in one go
//                                                            (NAME defaults to the repo folder name)
//   covenant init [--project NAME] [--dir docs/covenant] [--no-wire]   marker + data dir + the repo wiring
//   covenant wire [--browser tools|server]                   launcher, skills, agent, rules, hook → <repo>/.claude
//   covenant doctor [--no-clipboard]                         what this machine and repo have and lack
//   covenant open --title T --goal G [--question Q | --question-file F] [--context a,b] [--cap N]
//                 [--mode decide|build] [--adapter extension|codex|browser|openai] [--session ID] [--no-blind]
//   covenant plan propose --file plan.md | plan sign [--by NAME] | plan review-text      build mode
//   covenant step start [n] | step done [n] --evidence a,b [--note "…"] | step review-text [n]
//   covenant outgoing --plan | --step [n]                    the review message for the plan / a step
//   covenant slack-pull [--thread DIR]                       Gandalf's Slack replies → recorded
//   covenant record --author claude|gpt|human|watch (--message-file F | --message M | --from-clipboard)
//                   [--thread DIR] [--chat-url U]           log a message, move the state, run the guard
//   covenant outgoing [--message-file F] [--thread DIR] [--clip] [--full] the exact text to send
//                     (blind thread: 1st send = question only, 2nd = Théoden's position)
//   covenant watch-brief [--thread DIR]                      the prompt for the covenant-watch agent
//   covenant context [--thread DIR] [--budget N] [--clip]    goal context: pack sections + named files
//   covenant attach --file F [--thread DIR] [--as NAME] [--note "…"]   a file for Gríma mid-thread
//   covenant helper                                          print the chatgpt.com page helper
//   covenant instructions [--clip]                           persona + owner = the ChatGPT project's instructions
//   covenant pack [--repo DIR]                               build <dataDir>/files/ for the project's Sources
//   covenant sources                                         list the pack files and how to add them
//   covenant clip --file F                                   any file → clipboard
//   covenant project [--url U]                               this machine's ChatGPT project URL for this project
//   covenant config [--set key=value]                        this machine's overrides (~/.covenant/config.json)
//   covenant turn [--thread DIR] (--message M | --message-file F)        hook lanes (codex, browser)
//   covenant status | threads | pending | unclaim
//   covenant pause | resume | stop [--thread DIR]            stop = close by Gandalf
//   covenant close [--thread DIR] [--verdict V]
//   covenant render [--thread DIR]
//   covenant compile --title T [--goal G] [--question Q] [--context a,b] [--lean]
//   covenant browser [--dev]                                 the Playwright daemon (browser lane)
//   covenant install [--browser tools|server] [--plan]       hook, allow rules, skills, Háma agent → ~/.claude
//   covenant uninstall                                       removes exactly what install added
//
// Every command accepts --cwd DIR (default: the current directory).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { HOME, LOCAL, ROOT, TEMPLATE, findMarker, loadConfig, loadLocal, nowIso, resolveProject, saveLocalConfig } from '../src/config.mjs';
import { compileBrief } from '../src/brief.mjs';
import { getClipboard, setClipboard } from '../src/clipboard.mjs';
import { buildGoalContext } from '../src/context.mjs';
import { doctor } from '../src/doctor.mjs';
import { install, plannedRules, uninstall } from '../src/install.mjs';
import { wire } from '../src/wire.mjs';
import { setup } from '../src/setup.mjs';
import { pace, paceStatus } from '../src/pace.mjs';
import { buildStatus, finishStep, planReviewText, proposePlan, signPlan, startStep, stepReviewText } from '../src/build.mjs';
import { slackOpen, slackPull } from '../src/slack.mjs';
import { appendEvent, createThread, listThreads, loadThread, render, resolveThreadDir, saveThread } from '../src/ledger.mjs';
import { buildPack } from '../src/pack.mjs';
import { bindings, clearPending, pendingInfo, writePending } from '../src/state.mjs';
import { closeThread, exchange, frameForClaude, outgoingText, readMessageArg, recordOnly, sendGate, watchBrief } from '../src/turn.mjs';

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) flags[k] = true;
    else {
      flags[k] = v;
      i++;
    }
  } else pos.push(argv[i]);
}
const cmd = pos[0];
const cwd = flags.cwd && flags.cwd !== true ? resolve(String(flags.cwd)) : process.cwd();
const out = (o) => process.stdout.write((typeof o === 'string' ? o : JSON.stringify(o, null, 2)) + '\n');
const die = (m) => {
  process.stderr.write(`covenant: ${m}\n`);
  process.exit(1);
};
const project = () => resolveProject(cwd);
const thread = () => resolveThreadDir(flags.thread, cwd);

export function instructionsText(p) {
  const strip = (f) => (existsSync(join(p.dataDir, f)) ? readFileSync(join(p.dataDir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() : '');
  const text = [strip('persona.md'), strip('owner.md') ? `## Who you are talking to\n\n${strip('owner.md')}` : ''].filter(Boolean).join('\n\n');
  return { text, hash: createHash('sha256').update(text).digest('hex').slice(0, 16) };
}
// Stale = the text on disk differs from what was last recorded as pasted (or nothing was ever recorded).
export function instructionsStale(p) {
  const recorded = (loadLocal().projects || {})[p.name]?.instructionsHash || null;
  return recorded !== instructionsText(p).hash;
}

function nextStep(r, cfg) {
  if (r.kind === 'watch') {
    return {
      'on-course': 'continue: answer Gríma',
      nudge: `answer Gríma and open your message with "Háma: ${r.watch.nudge || r.watch.reason}"`,
      pause: 'Háma paused the thread: end your turn with a short summary for Gandalf',
      close: `Háma says the goal is met: close with "${cfg.closeLine} ${r.watch.verdictLine || '<verdict>'}" if you agree; otherwise covenant pause and ask Gandalf`,
    }[r.verdict];
  }
  if (r.kind === 'recorded') {
    if (r.meta.state !== 'open') return `thread is ${r.meta.state}${r.meta.pausedReason ? `: ${r.meta.pausedReason}` : ''}`;
    if (r.lastAuthor === 'human') return 'answer Gandalf first; open your next message to Gríma with "From Gandalf: …"';
    if (r.lastAuthor === 'gpt') return `${r.flags?.stalled ? 'STALLED (three holds in a row) — ' : ''}run Háma: covenant watch-brief → covenant-watch agent → record --author watch; then answer Gríma`;
    return 'send it: outgoing --clip, paste into ChatGPT, Return, wait, then record --author gpt';
  }
  if (['closed-by-claude', 'closed-by-gpt', 'cap'].includes(r.kind)) return 'thread closed and recorded: summarize the outcome for Gandalf';
  return r.reason || r.kind;
}

const commands = {
  async init() {
    const found = findMarker(cwd);
    if (!found) die(`${cwd} is not inside a git repository`);
    const name = flags.project && flags.project !== true ? String(flags.project) : found.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    const dir = flags.dir && flags.dir !== true ? String(flags.dir) : loadConfig().dataDir;
    const dataDir = resolve(found.root, dir);
    if (!found.marker) writeFileSync(found.path, JSON.stringify({ project: name, dir }, null, 2) + '\n');
    mkdirSync(join(dataDir, 'threads'), { recursive: true });
    const created = [];
    for (const f of readdirSync(TEMPLATE)) {
      const dst = join(dataDir, f);
      if (existsSync(dst)) continue;
      writeFileSync(dst, readFileSync(join(TEMPLATE, f), 'utf8').replaceAll('{{PROJECT}}', name));
      created.push(f);
    }
    if (!existsSync(join(dataDir, 'ledger.md'))) writeFileSync(join(dataDir, 'ledger.md'), `# Covenant ledger — ${name}\n\nOne line per closed thread, oldest first.\n\n`);
    out({ marker: found.path, dataDir, created, next: ['edit persona.md, owner.md, brief.md, pack.json in the data dir', 'add "<dir>/files/" to the repo .gitignore (the pack is derived)', 'covenant pack', 'covenant doctor'] });
  },
  async doctor() {
    const r = doctor({ cwd, clipboard: !flags['no-clipboard'] });
    out(r);
    if (!r.ok) process.exitCode = 2;
  },
  async open() {
    const p = project();
    const title = flags.title || die('--title is required');
    const goal = flags.goal && flags.goal !== true ? String(flags.goal) : die('--goal is required: the decision to reach and what counts as done');
    const question = flags['question-file'] ? readFileSync(flags['question-file'], 'utf8').trim() : flags.question || title;
    const contextPaths = flags.context ? String(flags.context).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const mode = flags.mode === 'build' ? 'build' : 'decide';
    const { dir, meta } = createThread({
      project: p,
      title,
      goal,
      mode,
      adapter: flags.adapter || (mode === 'build' ? p.cfg.buildAdapter : p.cfg.adapter),
      cap: Number(flags.cap || (mode === 'build' ? p.cfg.buildCap : p.cfg.cap)),
      question,
      contextPaths,
      cwd,
      model: flags.model || null,
      blind: mode === 'build' ? false : flags['no-blind'] ? false : flags.blind === true || p.cfg.blindFirstTake !== false,
    });
    const binding = meta.adapter === 'extension' ? { bound: 'extension lane: no hook binding' } : writePending(dir, cwd, flags.session && flags.session !== 'true' ? flags.session : null);
    let slack = null;
    try {
      slack = slackOpen(dir);
    } catch {}
    out({ dir, id: meta.id, project: p.name, repo: p.repoRoot, mode, adapter: meta.adapter, cap: meta.cap, blind: meta.blind, goal: meta.goal, projectUrl: p.cfg.browser.projectUrl || null, slack, ...binding });
  },
  // ---- build mode -----------------------------------------------------------
  async plan() {
    const sub = pos[1];
    const dir = thread();
    if (sub === 'propose') out(proposePlan(dir, flags.file || die('--file <plan.md> is required')));
    else if (sub === 'sign') out(signPlan(dir, flags.by && flags.by !== true ? String(flags.by) : 'Gandalf'));
    else if (sub === 'review-text') out(planReviewText(dir));
    else die('plan propose --file F | plan sign | plan review-text');
  },
  async step() {
    const sub = pos[1];
    const dir = thread();
    const n = flags.n && flags.n !== true ? Number(flags.n) : pos[2] ? Number(pos[2]) : undefined;
    if (sub === 'start') out(startStep(dir, n));
    else if (sub === 'done') out(finishStep(dir, n, flags.evidence ? String(flags.evidence).split(',').map((s) => s.trim()).filter(Boolean) : [], flags.note && flags.note !== true ? String(flags.note) : ''));
    else if (sub === 'review-text') out(stepReviewText(dir, n));
    else die('step start [n] | step done [n] --evidence a,b [--note "…"] | step review-text [n]');
  },
  // Gandalf's words from the Slack channel, if the mirror is on.
  async 'slack-pull'() {
    const dir = thread();
    const fresh = slackPull(dir);
    for (const m of fresh) await recordOnly({ dir, author: 'human', text: `${m.text}\n\n(— ${m.user}, from Slack)` });
    out({ recorded: fresh.length, messages: fresh.map((m) => `${m.user}: ${m.text.slice(0, 120)}`) });
  },
  async record() {
    const dir = thread();
    const author = flags.author;
    if (!['claude', 'gpt', 'human', 'watch'].includes(author)) die('--author claude|gpt|human|watch');
    const text = flags['from-clipboard'] ? getClipboard() : readMessageArg(flags);
    if (text == null) die('--message, --message-file or --from-clipboard');
    const r = await recordOnly({ dir, author, text, chatUrl: flags['chat-url'] });
    if (r.kind === 'skipped') die(`skipped: ${r.reason}`);
    r.lastAuthor = author;
    const cfg = resolveProject(r.meta.repoRoot).cfg;
    const base = { kind: r.kind, state: r.meta.state, gptTurns: r.meta.gptTurns, cap: r.meta.cap, id: r.meta.id, next: nextStep(r, cfg) };
    if (r.kind === 'watch') out({ ...base, verdict: r.verdict, progress: r.watch.progress, reason: r.watch.reason, nudge: r.watch.nudge, verdictLine: r.watch.verdictLine, safety: r.watch.safety });
    else out({ ...base, verdict: r.verdict || r.meta.verdict || null, flags: r.flags || {}, lastStance: r.meta.lastStance || null, ...(flags['from-clipboard'] ? { recorded: text } : {}) });
  },
  async outgoing() {
    const dir = thread();
    const meta = loadThread(dir);
    const cfg = resolveProject(meta.repoRoot).cfg;
    const gate = sendGate(meta, cfg);
    if (gate) die(`cannot send — ${gate}`);
    const questionOnly = (meta.blind || meta.mode === 'build') && meta.gptTurns === 0;
    let text = readMessageArg(flags);
    if (meta.mode === 'build' && flags.plan) text = planReviewText(dir);
    if (meta.mode === 'build' && flags.step) text = stepReviewText(dir, flags.step === true ? undefined : Number(flags.step));
    if (text == null && !questionOnly) die('--message, --message-file, --plan or --step <n> is required');
    text = text ?? '';
    const lean = flags.full ? false : flags.lean ? true : !!cfg.browser.projectUrl;
    const t = outgoingText({ dir, text, lean });
    const what = meta.mode === 'build' ? (meta.gptTurns === 0 ? 'the brief and the requirements question' : flags.plan ? `plan v${meta.plan?.version} for review` : flags.step ? `step ${flags.step === true ? 'current' : flags.step} for review` : `Théoden turn ${meta.claudeTurns}`) : questionOnly ? 'the question alone (blind first take)' : meta.blind && meta.gptTurns === 1 ? "Théoden's position" : `Théoden turn ${meta.claudeTurns}`;
    if (flags.clip) {
      const paced = pace(cfg); // human cadence: a short wait is served here, a daily cap refuses
      setClipboard(t);
      const m = loadThread(dir);
      m.sent = (m.sent || 0) + 1;
      saveThread(dir, m);
      out({ clipboard: true, chars: t.length, sends: what, sent: m.sent, firstSend: meta.gptTurns === 0, lean, pace: paced, openIn: meta.gptTurns === 0 ? cfg.browser.projectUrl || 'https://chatgpt.com/' : meta.chat?.url || null });
    } else out(t);
  },
  async 'watch-brief'() {
    const dir = thread();
    out(watchBrief(dir, { exchanges: resolveProject(loadThread(dir).repoRoot).cfg.watch.exchanges }));
  },
  async context() {
    const dir = thread();
    const meta = loadThread(dir);
    const r = buildGoalContext(dir, meta, { budget: Number(flags.budget || 12000) });
    if (flags.clip) {
      setClipboard(`## Attachment: goal-context.md\n\n${r.text}`);
      out({ clipboard: true, file: r.file, chars: r.text.length, sections: r.sections, files: r.files, next: 'paste into the composer first (it becomes an attachment chip), then outgoing --clip, paste, Return' });
    } else out(r.text);
  },
  async attach() {
    const dir = thread();
    const f = flags.file || die('--file <path> is required');
    const name = flags.as || f.replace(/\\/g, '/').split('/').pop();
    const text = readFileSync(f, 'utf8');
    const adir = join(dir, 'attachments');
    mkdirSync(adir, { recursive: true });
    writeFileSync(join(adir, name), text);
    appendEvent(dir, { author: 'system', text: `attachment prepared for Gríma: ${name} (${text.length} chars) → attachments/${name}` });
    const framed = `${flags.note ? `${flags.note}\n\n` : ''}## Attachment: ${name}\n\n${text}`;
    setClipboard(framed);
    out({ clipboard: true, name, chars: framed.length, kept: join(adir, name), next: `paste into the composer (a long paste becomes an attachment chip), type "Attached: ${name}", Return, wait, read, then record --author claude --message "attached ${name}: <one line>"` });
  },
  async helper() {
    out(readFileSync(join(ROOT, 'skills', 'covenant', 'chatgpt-page.js'), 'utf8'));
  },
  // The ChatGPT project's instructions = persona + owner. `--clip` copies them;
  // `--pasted` records that the current text is now in the project, so `doctor`
  // can tell when persona.md or owner.md changed after the last paste.
  async instructions() {
    const p = project();
    const { text, hash } = instructionsText(p);
    if (flags.pasted) {
      saveLocalConfig({ projects: { [p.name]: { instructionsHash: hash, instructionsPastedAt: nowIso() } } });
      return out({ recorded: hash, chars: text.length });
    }
    if (flags.clip) {
      setClipboard(text);
      out({ clipboard: true, chars: text.length, hash, limitHint: 5000, stale: instructionsStale(p), next: 'paste into the ChatGPT project (Project settings → Instructions), then: covenant instructions --pasted' });
    } else {
      out(text);
      process.stderr.write(`\n[${text.length} chars; ChatGPT project instructions allow about 5000]\n`);
    }
  },
  async pack() {
    out(buildPack(project(), { repo: flags.repo && flags.repo !== true ? String(flags.repo) : undefined }));
  },
  async sources() {
    const p = project();
    if (!existsSync(p.filesDir)) die(`no pack yet: run \`covenant pack\` first (${p.filesDir})`);
    out({
      dir: p.filesDir,
      files: readdirSync(p.filesDir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ file: f, kb: Math.round(statSync(join(p.filesDir, f)).size / 1024) })),
      how: 'per file: covenant clip --file <dir>/<file>; in ChatGPT: project → Sources → Add sources → Paste text → title = file name → ctrl+v → Save. Remove the old source of the same name first when refreshing.',
    });
  },
  async clip() {
    const f = flags.file || die('--file <path> is required');
    const text = readFileSync(f, 'utf8');
    setClipboard(text);
    out({ clipboard: true, file: f, chars: text.length });
  },
  async project() {
    const p = project();
    if (flags.url && flags.url !== true) {
      const file = saveLocalConfig({ projects: { [p.name]: { browser: { projectUrl: String(flags.url) } } } });
      out({ project: p.name, projectUrl: String(flags.url), savedTo: file });
    } else out({ project: p.name, repo: p.repoRoot, dataDir: p.dataDir, adapter: p.cfg.adapter, projectUrl: p.cfg.browser.projectUrl || null, note: 'set with: covenant project --url <ChatGPT project URL>' });
  },
  async config() {
    if (flags.set && flags.set !== true) {
      const [key, ...rest] = String(flags.set).split('=');
      const raw = rest.join('=');
      let value = raw;
      try {
        value = JSON.parse(raw);
      } catch {}
      const patch = {};
      let cur = patch;
      const parts = key.split('.');
      parts.forEach((p, i) => (i === parts.length - 1 ? (cur[p] = value) : (cur = cur[p] = {})));
      out({ savedTo: saveLocalConfig(patch), set: { [key]: value } });
    } else {
      let effective = null;
      try {
        effective = project().cfg;
      } catch {}
      out({ local: LOCAL, localConfig: loadLocal(), effectiveForThisRepo: effective });
    }
  },
  async turn() {
    const dir = thread();
    const text = readMessageArg(flags) ?? die('--message or --message-file is required');
    const r = await exchange({ dir, claudeText: text });
    if (r.kind === 'skipped') die(`skipped: ${r.reason}`);
    out(frameForClaude(r) || `thread ${r.kind}${r.verdict ? `: ${r.verdict}` : ''}`);
  },
  async status() {
    let p = null;
    try {
      p = project();
    } catch (e) {
      return out({ project: null, error: e.message, bindings: bindings(), pending: pendingInfo() });
    }
    let daemon = null;
    if (p.cfg.adapter === 'browser') {
      try {
        daemon = await (await import('../src/adapters/browser.mjs')).status();
      } catch (e) {
        daemon = { ok: false, error: e.message };
      }
    }
    out({
      project: p.name,
      repo: p.repoRoot,
      adapter: p.cfg.adapter,
      projectUrl: p.cfg.browser.projectUrl || null,
      daemon,
      pending: pendingInfo(),
      bindings: bindings(),
      pace: paceStatus(p.cfg),
      openThreads: listThreads(p.threadsDir)
        .filter((t) => t.meta.state !== 'closed')
        .map((t) => ({ id: t.meta.id, dir: t.dir, mode: t.meta.mode, adapter: t.meta.adapter, state: t.meta.state, gptTurns: t.meta.gptTurns, cap: t.meta.cap, sent: t.meta.sent || 0, goal: t.meta.goal, chat: t.meta.chat?.url || null, pausedReason: t.meta.pausedReason, watch: t.meta.watch?.verdict || null, build: buildStatus(t.meta) })),
    });
  },
  async threads() {
    out(listThreads(project().threadsDir).map((t) => `${t.meta.id}  ${t.meta.state.padEnd(6)}  ${t.meta.gptTurns}/${t.meta.cap}  ${t.meta.verdict || ''}`).join('\n') || '(none)');
  },
  async pending() {
    out(pendingInfo() || '(none)');
  },
  async unclaim() {
    clearPending();
    out('pending cleared');
  },
  async pause() {
    setState('paused', flags.reason || 'paused by Gandalf');
  },
  async resume() {
    setState('open', null, `resumed by ${flags.by || 'Gandalf'}`);
  },
  async stop() {
    const dir = thread();
    await closeThread(dir, { by: 'human', verdict: flags.verdict || 'stopped by Gandalf' });
    out(`closed ${dir}`);
  },
  async close() {
    const dir = thread();
    await closeThread(dir, { by: flags.by || 'human', verdict: flags.verdict || null });
    out(`closed ${dir}`);
  },
  async render() {
    out(render(thread()));
  },
  async compile() {
    const p = project();
    const meta = {
      title: flags.title || 'dry run',
      goal: flags.goal && flags.goal !== true ? flags.goal : null,
      project: p.name,
      repoRoot: p.repoRoot,
      dataDir: p.dataDir,
      question: flags.question || flags.title || 'dry run',
      contextPaths: flags.context ? String(flags.context).split(',') : [],
      cap: Number(flags.cap || p.cfg.cap),
    };
    const brief = compileBrief(meta, { lean: !!flags.lean });
    out(brief);
    process.stderr.write(`\n[${brief.length} chars ≈ ${Math.round(brief.length / 4)} tokens]\n`);
  },
  async browser() {
    await import('../src/browser-daemon.mjs');
  },
  // One command per machine, run by the human: hook, allow rules, skills, agent, root.
  //   covenant install [--browser tools|server] [--plan]   (--plan prints what it would grant)
  async install() {
    const browser = flags.browser === 'server' ? 'server' : 'tools';
    if (flags.plan) return out({ settings: join(homedir(), '.claude', 'settings.json'), wouldAllow: plannedRules({ browser }), skills: ['covenant', 'covenant-setup'], agents: ['covenant-watch'], hook: 'Stop → hooks/claude-stop.mjs' });
    out(install({ browser }));
  },
  async uninstall() {
    out(uninstall());
  },
  // Everything for a repo in one go: init + wire + gitignore + project URL + pack +
  // doctor + a --only commit on the current branch. See src/setup.mjs.
  async setup() {
    out(
      setup({
        cwd,
        project: flags.project && flags.project !== true ? String(flags.project) : undefined,
        dir: flags.dir && flags.dir !== true ? String(flags.dir) : undefined,
        projectUrl: flags['project-url'] && flags['project-url'] !== true ? String(flags['project-url']) : undefined,
        browser: flags.browser === 'server' ? 'server' : 'tools',
        commit: !flags['no-commit'],
      }),
    );
  },
  // The wiring as project files: launcher, skills, agent, allow rules and hook in
  // <repo>/.claude. Cloning the repo is then the install.
  async wire() {
    const found = findMarker(cwd);
    if (!found) die(`${cwd} is not inside a git repository`);
    out(wire(found.root, { browser: flags.browser === 'server' ? 'server' : 'tools' }));
  },
  // The Stop hook, callable through the launcher (project-level hook).
  async 'stop-hook'() {
    await import('../hooks/claude-stop.mjs');
  },
};
commands['install-hook'] = commands.install;

function setState(state, reason, note) {
  const dir = thread();
  const meta = loadThread(dir);
  if (meta.state === 'closed') die('thread is closed');
  meta.state = state;
  meta.pausedReason = reason;
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `${state}${reason ? `: ${reason}` : ''}${note ? ` — ${note}` : ''} (${nowIso()})` });
  render(dir);
  out(`${meta.id} is now ${state}`);
}

if (!cmd || !commands[cmd]) {
  process.stderr.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 33).map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n');
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((e) => die(e.message || e));
