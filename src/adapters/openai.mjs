// API lane: the Navigator through the OpenAI Responses API. No browser, no
// subscription; billed per token on the key in OPENAI_API_KEY or
// ~/.covenant/config.json → openai.apiKey. Conversation state is kept server side
// through previous_response_id; the persona + owner notes are the instructions.
// Used for unattended threads; the Stop hook drives it like the codex lane.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLocal, projectOf } from '../config.mjs';

function settings(meta) {
  const project = projectOf(meta);
  const cfg = project.cfg.openai || {};
  const apiKey = process.env.OPENAI_API_KEY || loadLocal().openai?.apiKey || cfg.apiKey;
  if (!apiKey) throw new Error('no OpenAI key: set OPENAI_API_KEY or ~/.covenant/config.json → openai.apiKey');
  const model = cfg.model || 'gpt-5.1';
  const strip = (f) => (existsSync(join(project.dataDir, f)) ? readFileSync(join(project.dataDir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() : '');
  const instructions = [strip('persona.md'), strip('owner.md') ? `## Who you are talking to\n\n${strip('owner.md')}` : ''].filter(Boolean).join('\n\n');
  return { apiKey, model, instructions, baseUrl: cfg.baseUrl || 'https://api.openai.com/v1', reasoning: cfg.reasoning || 'medium' };
}

async function respond(meta, input, previousResponseId) {
  const s = settings(meta);
  const body = { model: s.model, instructions: s.instructions, input, store: true };
  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (s.reasoning) body.reasoning = { effort: s.reasoning };
  const t0 = Date.now();
  const res = await fetch(`${s.baseUrl}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((projectOf(meta).cfg.browser?.replyTimeoutSeconds || 900) * 1000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 200)}`);
  const text = json.output_text || (json.output || []).flatMap((o) => (o.content || []).map((c) => c.text || '')).join('\n');
  return { id: json.id, reply: String(text || '').trim(), model: json.model || s.model, durationMs: Date.now() - t0 };
}

export async function open({ message, meta }) {
  const r = await respond(meta, message, null);
  return { chat: { responseId: r.id }, reply: r.reply, durationMs: r.durationMs, model: r.model };
}

export async function turn({ chat, message, meta }) {
  const r = await respond(meta, message, chat.responseId);
  return { reply: r.reply, durationMs: r.durationMs, chat: { responseId: r.id } };
}

export async function status() {
  return { ok: !!(process.env.OPENAI_API_KEY || loadLocal().openai?.apiKey), adapter: 'openai' };
}
