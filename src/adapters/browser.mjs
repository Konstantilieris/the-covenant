// Browser adapter: talks to the local daemon (src/browser-daemon.mjs) that drives
// chatgpt.com in the Covenant's own Chrome profile.
import { loadConfig, projectOf } from '../config.mjs';

async function call(path, body) {
  const cfg = loadConfig();
  const base = `http://127.0.0.1:${cfg.browser.port}`;
  let res;
  try {
    res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout((cfg.browser.replyTimeoutSeconds + 120) * 1000),
    });
  } catch (e) {
    if (/ECONNREFUSED|fetch failed/.test(String(e?.cause || e))) {
      throw new Error('browser daemon not running — start it with `node bin/covenant.mjs browser` in its own terminal');
    }
    throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `daemon answered ${res.status}`);
  return json;
}

export async function status() {
  return call('/status');
}

export async function open({ message, meta }) {
  const cfg = projectOf(meta).cfg;
  const r = await call('/open', { message, projectUrl: cfg.browser.projectUrl, title: meta?.title });
  return { chat: { url: r.url }, reply: r.reply, durationMs: r.durationMs, model: r.model || null };
}

export async function turn({ chat, message }) {
  const r = await call('/turn', { url: chat.url, message });
  return { reply: r.reply, durationMs: r.durationMs, chat: { url: r.url || chat.url } };
}
