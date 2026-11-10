// `build` mode: a thread that does not end in a verdict but in agreed, verified
// changes. Phases: requirements → plan → execute → done.
//
//   plan propose --file plan.md   the Chief's plan (requirements + numbered steps); sent to the Navigator
//   (the Navigator's review carries a ```verdict block; record --author gpt parses it)
//   plan sign                     the Captain signs the agreed plan; execution may begin
//   step start [n]                the Chief starts step n (previous steps must be agreed)
//   step done [n] --evidence a,b  the Chief finished step n; evidence files are kept and sent for review
//   step review-text [n]          the review message for step n (what `outgoing --step n` sends)
//   (an `agree` verdict marks the step agreed; `objections` sends it back, twice at most)
//
// Owner rulings 2026-11-10: the Navigator reviews execution through the codex lane
// (it reads the repo and runs tests itself); the Captain signs every plan before
// execution; structured verdicts; bounded retries.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { nowIso } from './config.mjs';
import { appendEvent, loadThread, render, saveThread } from './ledger.mjs';

export const MAX_STEP_ATTEMPTS = 2;

// ---- the plan file ---------------------------------------------------------
// # Plan: <title>
// ## Requirements
// - R1: <text>
// ## Steps
// ### 1. <title>
// files: a/b.ts, c/d.ts
// tests: <command or spec names>
// done when: <observable outcome>
export function parsePlan(text) {
  const reqs = [];
  const steps = [];
  const lines = text.split(/\r?\n/);
  let section = '';
  let step = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+requirements/i.test(line)) {
      section = 'req';
      continue;
    }
    if (/^##\s+steps/i.test(line)) {
      section = 'steps';
      continue;
    }
    if (/^##\s/.test(line)) {
      section = '';
      continue;
    }
    if (section === 'req') {
      const m = line.match(/^-\s*(?:(R\d+)\s*:\s*)?(.+)$/i);
      if (m) reqs.push({ id: m[1] || `R${reqs.length + 1}`, text: m[2].trim(), status: 'proposed' });
    }
    if (section === 'steps') {
      const h = line.match(/^###\s*(\d+)[.)]?\s*(.+)$/);
      if (h) {
        step = { n: Number(h[1]), title: h[2].trim(), files: [], tests: '', doneWhen: '', status: 'pending', attempts: 0, evidence: [], objections: [] };
        steps.push(step);
        continue;
      }
      if (!step) continue;
      const kv = line.match(/^(files|tests|done when)\s*:\s*(.*)$/i);
      if (kv) {
        const k = kv[1].toLowerCase();
        if (k === 'files') step.files = kv[2].split(',').map((s) => s.trim()).filter(Boolean);
        else if (k === 'tests') step.tests = kv[2].trim();
        else step.doneWhen = kv[2].trim();
      }
    }
  }
  return { requirements: reqs, steps };
}

// ---- the Navigator's structured verdict ------------------------------------
// ```verdict
// {"verdict":"agree|objections","objections":[{"id":"P1-1","severity":"blocker|major|minor","claim":"…","evidence":"…","change":"…"}]}
// ```
export function parseVerdict(text) {
  const m = String(text || '').match(/```verdict\s*([\s\S]*?)```/i) || String(text || '').match(/VERDICT:\s*(\{[\s\S]*?\})\s*$/im);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1].trim());
    const verdict = String(v.verdict || '').toLowerCase() === 'agree' ? 'agree' : 'objections';
    const objections = Array.isArray(v.objections) ? v.objections.map((o, i) => ({ id: o.id || `O${i + 1}`, severity: String(o.severity || 'minor').toLowerCase(), claim: o.claim || '', evidence: o.evidence || '', change: o.change || '' })) : [];
    const blocking = objections.filter((o) => o.severity === 'blocker' || o.severity === 'major');
    return { verdict: blocking.length ? 'objections' : verdict, objections, blocking: blocking.length };
  } catch {
    return null;
  }
}

// ---- phases ------------------------------------------------------------------
export function proposePlan(dir, file) {
  const meta = loadThread(dir);
  if (meta.mode !== 'build') throw new Error('not a build thread (open with --mode build)');
  if (meta.phase === 'execute' || meta.phase === 'done') throw new Error(`plan is already ${meta.phase === 'done' ? 'finished' : 'signed and in execution'}`);
  const text = readFileSync(file, 'utf8');
  const parsed = parsePlan(text);
  if (!parsed.steps.length) throw new Error('the plan has no "### 1. <title>" steps under "## Steps"');
  const version = (meta.plan?.version || 0) + 1;
  const kept = join(dir, `plan.v${version}.md`);
  writeFileSync(kept, text);
  meta.phase = 'plan';
  meta.requirements = parsed.requirements;
  meta.plan = { version, file: basename(kept), agreed: false, signedAt: null, signedBy: null, steps: parsed.steps };
  meta.lastVerdict = null;
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `plan v${version} proposed: ${parsed.steps.length} steps, ${parsed.requirements.length} requirements` });
  render(dir);
  return { version, file: kept, steps: parsed.steps.map((s) => `${s.n}. ${s.title}`), requirements: parsed.requirements.length };
}

// Called by recordOnly for every Navigator reply in a build thread.
export function applyVerdict(dir, meta, reply) {
  const v = parseVerdict(reply);
  if (!v) return null;
  meta.lastVerdict = { ...v, at: nowIso(), phase: meta.phase, step: meta.phase === 'execute' ? currentStep(meta)?.n ?? null : null };
  if (meta.phase === 'plan') {
    meta.plan.agreed = v.verdict === 'agree';
    appendEvent(dir, { author: 'system', text: `plan v${meta.plan.version}: Gríma ${v.verdict}${v.blocking ? ` (${v.blocking} blocking)` : ''}` });
  } else if (meta.phase === 'execute') {
    const step = currentStep(meta);
    if (step && step.status === 'done') {
      step.objections = v.objections;
      if (v.verdict === 'agree') {
        step.status = 'agreed';
        step.agreedAt = nowIso();
        appendEvent(dir, { author: 'system', text: `step ${step.n} agreed by Gríma` });
        if (meta.plan.steps.every((s) => s.status === 'agreed')) {
          meta.phase = 'done';
          appendEvent(dir, { author: 'system', text: 'all steps agreed: the build is done — close with the verdict line' });
        }
      } else if (step.attempts >= MAX_STEP_ATTEMPTS) {
        step.status = 'blocked';
        meta.state = 'paused';
        meta.pausedReason = `step ${step.n} rejected ${step.attempts} times — Gandalf decides`;
        appendEvent(dir, { author: 'system', text: `paused: ${meta.pausedReason}` });
      } else {
        step.status = 'rework';
        appendEvent(dir, { author: 'system', text: `step ${step.n}: ${v.blocking} blocking objection(s); rework (attempt ${step.attempts} of ${MAX_STEP_ATTEMPTS})` });
      }
    }
  }
  return v;
}

export function signPlan(dir, by = 'the Captain') {
  const meta = loadThread(dir);
  if (meta.mode !== 'build' || !meta.plan) throw new Error('no plan to sign');
  if (!meta.plan.agreed) throw new Error(`plan v${meta.plan.version} is not agreed by Gríma yet (last verdict: ${meta.lastVerdict?.verdict || 'none'})`);
  meta.plan.signedAt = nowIso();
  meta.plan.signedBy = by;
  meta.phase = 'execute';
  for (const r of meta.requirements || []) r.status = 'agreed';
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `plan v${meta.plan.version} signed by ${by}; execution begins at step 1` });
  render(dir);
  return { version: meta.plan.version, steps: meta.plan.steps.length };
}

export function currentStep(meta) {
  return (meta.plan?.steps || []).find((s) => s.status !== 'agreed') || null;
}

export function startStep(dir, n) {
  const meta = loadThread(dir);
  gateExecute(meta);
  const step = pick(meta, n);
  const prev = meta.plan.steps.filter((s) => s.n < step.n);
  if (prev.some((s) => s.status !== 'agreed')) throw new Error(`step ${step.n} cannot start: an earlier step is not agreed yet`);
  if (step.status === 'agreed') throw new Error(`step ${step.n} is already agreed`);
  step.status = 'in_progress';
  step.startedAt = nowIso();
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `step ${step.n} started: ${step.title}` });
  render(dir);
  return step;
}

export function finishStep(dir, n, evidenceFiles, note) {
  const meta = loadThread(dir);
  gateExecute(meta);
  const step = pick(meta, n);
  if (!['in_progress', 'rework'].includes(step.status)) throw new Error(`step ${step.n} is ${step.status}; start it first`);
  const edir = join(dir, 'steps', String(step.n));
  mkdirSync(edir, { recursive: true });
  const kept = [];
  for (const f of evidenceFiles) {
    if (!existsSync(f)) throw new Error(`evidence not found: ${f}`);
    const dst = join(edir, `attempt-${step.attempts + 1}-${basename(f)}`);
    copyFileSync(f, dst);
    kept.push(dst);
  }
  step.attempts++;
  step.status = 'done';
  step.evidence.push(...kept);
  step.note = note || step.note || '';
  step.doneAt = nowIso();
  saveThread(dir, meta);
  appendEvent(dir, { author: 'system', text: `step ${step.n} done (attempt ${step.attempts}): ${kept.length} evidence file(s)` });
  render(dir);
  return { step: step.n, attempt: step.attempts, evidence: kept };
}

// The message the Chief sends for a step review.
export function stepReviewText(dir, n, { maxChars = 6000 } = {}) {
  const meta = loadThread(dir);
  const step = pick(meta, n);
  const lines = [`## Step ${step.n} done: ${step.title} (attempt ${step.attempts})`, ''];
  if (step.doneWhen) lines.push(`**Done when:** ${step.doneWhen}`, '');
  if (step.files.length) lines.push(`**Files:** ${step.files.join(', ')}`, '');
  if (step.tests) lines.push(`**Tests:** ${step.tests}`, '');
  if (step.note) lines.push(step.note, '');
  for (const f of step.evidence.slice(-3)) {
    let t = readFileSync(f, 'utf8');
    if (t.length > maxChars) t = t.slice(0, maxChars) + '\n…(cut)';
    lines.push(`### Evidence: ${basename(f).replace(/^attempt-\d+-/, '')}`, '', '```', t.trim(), '```', '');
  }
  if (step.objections?.length) lines.push('**Previous objections addressed:** ' + step.objections.map((o) => o.id).join(', '), '');
  lines.push('Review this step against the plan and the evidence. In the codex lane, open the files and run the tests yourself. Answer with your findings and end with a ```verdict block: `agree`, or `objections` with id, severity (blocker | major | minor), claim, evidence and change. A step is sent back at most twice; then Gandalf decides.');
  return lines.join('\n');
}

export function planReviewText(dir) {
  const meta = loadThread(dir);
  const text = readFileSync(join(dir, meta.plan.file), 'utf8');
  return `## Plan v${meta.plan.version} for review\n\n${text.trim()}\n\nReview the requirements and every step: is each step the right size, does it name real files and real tests, does "done when" describe something observable, is anything missing or unnecessary? End with a \`\`\`verdict block: \`agree\` only when no blocker or major objection remains; otherwise \`objections\` with id, severity, claim, evidence and change.`;
}

export function buildStatus(meta) {
  if (meta.mode !== 'build') return null;
  return {
    phase: meta.phase,
    plan: meta.plan ? { version: meta.plan.version, agreed: meta.plan.agreed, signed: !!meta.plan.signedAt } : null,
    steps: (meta.plan?.steps || []).map((s) => `${s.n} ${s.status}${s.attempts ? ` (${s.attempts})` : ''}: ${s.title}`),
    lastVerdict: meta.lastVerdict ? `${meta.lastVerdict.verdict}${meta.lastVerdict.blocking ? ` (${meta.lastVerdict.blocking} blocking)` : ''}` : null,
  };
}

// Gate for sends in build mode (in addition to sendGate's pause/Watch rules).
export function buildSendGate(meta) {
  if (meta.mode !== 'build') return null;
  if (meta.phase === 'execute' && !meta.plan?.signedAt) return 'the plan is not signed by the Captain (covenant plan sign)';
  return null;
}

function gateExecute(meta) {
  if (meta.mode !== 'build') throw new Error('not a build thread');
  if (meta.phase !== 'execute') throw new Error(`phase is ${meta.phase}; execution needs a signed plan`);
  if (meta.state !== 'open') throw new Error(`thread is ${meta.state}`);
}
function pick(meta, n) {
  const step = n ? meta.plan.steps.find((s) => s.n === Number(n)) : currentStep(meta);
  if (!step) throw new Error(n ? `no step ${n}` : 'no step left');
  return step;
}
