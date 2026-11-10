#!/usr/bin/env node
// `npm test` — the bookkeeping, end to end, in a throwaway git repo. No browser, no
// model, no network: init, pack, doctor, open, goal context, blind sends, the brake
// (no send until the Watch has spoken; a pause refuses sends and Chief messages),
// pause/resume, the Captain's record, close by the Navigator, the ledger line, the
// commit on a feature branch. Exits non-zero on the first failed check.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'covenant.mjs');
const HOME = mkdtempSync(join(tmpdir(), 'covenant-home-'));
const repo = mkdtempSync(join(tmpdir(), 'covenant-repo-'));
let failures = 0;

const env = { ...process.env, HOME, USERPROFILE: HOME, COVENANT_HOME: HOME };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function cov(args, { expectFail = false, input } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--cwd', repo], { encoding: 'utf8', env, cwd: repo, input });
  const ok = r.status === 0;
  if (ok === expectFail) {
    console.error(`\n✗ covenant ${args.join(' ')}\n  exit ${r.status}\n${(r.stdout || '').slice(-800)}\n${(r.stderr || '').slice(-800)}`);
    failures++;
  }
  return { ok, out: r.stdout || '', err: r.stderr || '' };
}
const json = (s) => JSON.parse(s.slice(s.indexOf('{')));
function check(name, cond, detail = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

try {
  // a throwaway repo on a feature branch
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'smoke@example.com');
  git('config', 'user.name', 'smoke');
  git('checkout', '-q', '-b', 'feature/smoke');
  writeFileSync(join(repo, 'README.md'), '# Scratch\n');
  writeFileSync(join(repo, 'CLAUDE.md'), '# Rules\nQuiet hours are 22:00-08:00.\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');

  const init = json(cov(['init', '--no-wire']).out);
  const marker = JSON.parse(readFileSync(join(repo, '.covenant.json'), 'utf8'));
  check('init names the project after the folder', marker.project === basename(repo) && existsSync(join(repo, 'docs', 'covenant', 'persona.md')), marker.project);
  // no pacing in tests: sends follow each other within seconds
  writeFileSync(join(repo, '.covenant.json'), JSON.stringify({ ...marker, pace: { minSecondsBetweenSends: 0, dailySendCap: 1000 } }, null, 2));
  const pack = json(cov(['pack']).out);
  check('pack builds bundles', pack.written.length >= 1, pack.written.map((w) => w.file).join(', '));
  const docRun = spawnSync(process.execPath, [CLI, 'doctor', '--no-clipboard', '--cwd', repo], { encoding: 'utf8', env, cwd: repo });
  const doc = json(docRun.stdout); // exit 2 is fine here: the user-level install is absent on CI
  check('doctor runs and finds the marker', doc.checks.some((c) => c.name === '.covenant.json' && c.ok));

  const open = json(cov(['open', '--title', 'gate test', '--goal', 'Prove the gates.', '--question', 'Do the gates hold?', '--context', 'CLAUDE.md', '--cap', '3']).out);
  const dir = open.dir;
  check('open creates a blind thread with a goal', open.blind === true && open.goal === 'Prove the gates.' && existsSync(join(dir, 'thread.json')));
  check('open without --goal is refused', cov(['open', '--title', 'no goal', '--question', 'q'], { expectFail: true }).ok === false);

  cov(['context', '--thread', dir]);
  check('context picks the named file', existsSync(join(dir, 'context.md')) && readFileSync(join(dir, 'context.md'), 'utf8').includes('CLAUDE.md'));

  writeFileSync(join(dir, 'claude-1.md'), 'Position: the gates hold if outgoing refuses in both states.\n');
  const rec1 = json(cov(['record', '--thread', dir, '--author', 'claude', '--message-file', join(dir, 'claude-1.md')]).out);
  check('the Chief\'s position is recorded first', rec1.kind === 'recorded');

  const first = cov(['outgoing', '--thread', dir]).out;
  check('first send is the question alone (blind)', first.includes('## The question') && !first.includes('Position: the gates'));

  writeFileSync(join(dir, 'gpt-1.md'), 'My take: yes.\n\nSTANCE: hold\nCONFIDENCE: medium\n');
  const rec2 = json(cov(['record', '--thread', dir, '--author', 'gpt', '--message-file', join(dir, 'gpt-1.md'), '--chat-url', 'https://chatgpt.com/c/x']).out);
  check('the Navigator\'s reply is recorded with its stance', rec2.kind === 'recorded' && rec2.lastStance === 'hold (medium)');

  const unwatched = cov(['outgoing', '--thread', dir, '--message-file', join(dir, 'claude-1.md')], { expectFail: true });
  check('no send until the Watch has reviewed the reply', !unwatched.ok && /Watch has not reviewed/.test(unwatched.err));

  const w = json(cov(['record', '--thread', dir, '--author', 'watch', '--message', '{"verdict":"pause","progress":"off-goal","reason":"test pause","nudge":null,"verdictLine":null,"safety":[]}']).out);
  check('a Watch pause pauses the thread', w.kind === 'watch' && w.state === 'paused');
  const paused = cov(['outgoing', '--thread', dir, '--message-file', join(dir, 'claude-1.md')], { expectFail: true });
  check('a paused thread refuses sends', !paused.ok && /paused/.test(paused.err));
  const pausedRec = cov(['record', '--thread', dir, '--author', 'claude', '--message', 'talking while paused'], { expectFail: true });
  check('a paused thread refuses Chief messages', !pausedRec.ok);

  cov(['resume', '--thread', dir]);
  const second = cov(['outgoing', '--thread', dir, '--message-file', join(dir, 'claude-1.md')]).out;
  check('after resume the position goes over', second.includes("The Chief's position"));

  const cap = json(cov(['record', '--thread', dir, '--author', 'human', '--message', 'From the Captain: keep it short.']).out);
  check('the Captain\'s words are recorded and answered first', /Captain/.test(cap.next));
  const brief = cov(['watch-brief', '--thread', dir]).out;
  check('the Watch brief carries goal, stances and the Captain', brief.includes('Prove the gates.') && brief.includes('hold') && brief.includes('Captain'));

  writeFileSync(join(dir, 'gpt-2.md'), 'On the Chief: agree.\n\nSTANCE: agree\nCONFIDENCE: high\n\nCOVENANT CLOSE: gates hold.\n');
  const close = json(cov(['record', '--thread', dir, '--author', 'gpt', '--message-file', join(dir, 'gpt-2.md')]).out);
  check('the Navigator closes with a verdict', close.kind === 'closed-by-gpt' && close.verdict === 'gates hold.');
  const ledger = readFileSync(join(repo, 'docs', 'covenant', 'ledger.md'), 'utf8');
  check('the ledger has the line with the last stance', ledger.includes('gates hold.') && ledger.includes('agree (high)'));
  const log = git('log', '--oneline');
  check('the thread is committed on the feature branch', /docs\(covenant\): gate test/.test(log) && git('branch', '--show-current') === 'feature/smoke');
  check('the thread dir and transcript exist', existsSync(join(dir, 'transcript.md')));
} catch (e) {
  console.error('\n✗ smoke run crashed:', e.stack || e);
  failures++;
} finally {
  rmSync(repo, { recursive: true, force: true });
  rmSync(HOME, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
