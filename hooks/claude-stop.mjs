#!/usr/bin/env node
// Claude Code Stop hook. Fires on every stop of every session, so the no-thread
// path must be instant and silent. With a thread bound to this session it relays
// Claude's last message to GPT and hands the reply back as the reason Claude may
// not stop yet. Fails open: any error → exit 0 with a note on stderr.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => main().catch((e) => {
  process.stderr.write(`covenant hook: ${e?.stack || e}\n`);
  process.exit(0);
}));

async function main() {
  let ev = {};
  try {
    ev = JSON.parse(input || '{}');
  } catch {
    return;
  }
  const sessionId = ev.session_id;
  if (!sessionId) return;
  const { sessionState, claimPending } = await import('../src/state.mjs');
  const bound = sessionState(sessionId) || claimPending(sessionId, ev.cwd);
  if (!bound) return;

  const { exchange, frameForClaude } = await import('../src/turn.mjs');
  const r = await exchange({ dir: bound.thread, claudeText: ev.last_assistant_message || '' });
  const reason = frameForClaude(r);
  if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  if (r.kind === 'closed-by-claude') {
    process.stderr.write(`covenant: thread closed by Claude — ${r.verdict}\n`);
  }
}
