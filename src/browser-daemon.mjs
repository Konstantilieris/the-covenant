#!/usr/bin/env node
// The Covenant browser daemon: one Chrome window on the Covenant's own profile
// (.chrome-profile, logged into ChatGPT by hand once), one chatgpt.com tab, and a
// local HTTP door on 127.0.0.1:<port> that the adapter and the CLI talk to.
//
//   node bin/covenant.mjs browser [--dev]
//
// Plain Playwright, headed, no disguise: the browser announces itself as automated.
// Pace is enforced here (minSecondsBetweenSends, dailySendCap): one thread at a
// time, human cadence. --dev adds /eval and /screenshot for inspection.
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { HOME, ROOT, loadConfig } from './config.mjs';

const cfg = loadConfig();
const B = cfg.browser;
const profileDir = join(ROOT, B.profileDir);
const SENDS = join(HOME, 'sends.json');
const DEV = process.env.COVENANT_DEV === '1' || process.argv.includes('--dev');

// Each entry is a CSS union: the classic app (data-testid, #prompt-textarea) first,
// then the newer shell seen 2026-11-10 (textarea[name=prompt], aria labels).
const SEL = {
  composer: '#prompt-textarea, textarea[name="prompt"], #mobile-composer-prompt, [role="textbox"][contenteditable="true"]',
  send: 'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="Send prompt"]',
  stop: 'button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"], button[aria-label="Stop message"], button[aria-label="Stop"]',
  assistant: '[data-message-author-role="assistant"], [data-turn="assistant"], article[data-turn="assistant"]',
  user: '[data-message-author-role="user"], [data-turn="user"], article[data-turn="user"]',
  modelButton: '[data-testid="model-switcher-dropdown-button"], button[aria-label*="model" i]',
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let context, page;
let chain = Promise.resolve();
function serialize(fn) {
  const p = chain.then(fn, fn);
  chain = p.then(() => {}, () => {});
  return p;
}

async function start() {
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });
  context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: ['--window-size=1200,900'],
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
  page = context.pages()[0] || (await context.newPage());
  context.on('close', () => {
    log('Chrome closed — daemon exits');
    process.exit(0);
  });
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' }).catch((e) => log('initial navigation:', e.message));
  log(`Chrome up on profile ${profileDir}`);
}

async function ensureReady(timeout = 20000) {
  const title = await page.title().catch(() => '');
  if (/just a moment|attention required/i.test(title)) throw new Error('Cloudflare challenge in the Covenant Chrome — solve it by hand, then retry');
  if (/\/auth|log-?in/i.test(page.url())) throw new Error('not logged in — log in inside the Covenant Chrome window, then retry');
  try {
    await page.locator(SEL.composer).waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`no composer on ${page.url()} — log in or open a chat in the Covenant Chrome, then retry`);
  }
}

async function pace() {
  const today = new Date().toISOString().slice(0, 10);
  let s = {};
  try {
    s = JSON.parse(readFileSync(SENDS, 'utf8'));
  } catch {}
  if (s.day !== today) s = { day: today, count: 0, lastAt: 0 };
  if (s.count >= B.dailySendCap) throw new Error(`daily send cap (${B.dailySendCap}) reached; raise browser.dailySendCap or wait for tomorrow`);
  const wait = B.minSecondsBetweenSends * 1000 - (Date.now() - (s.lastAt || 0));
  if (wait > 0) {
    log(`pacing: waiting ${Math.ceil(wait / 1000)} s`);
    await page.waitForTimeout(wait);
  }
  s.count++;
  s.lastAt = Date.now();
  writeFileSync(SENDS, JSON.stringify(s));
}

const lastAssistantText = () =>
  page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    return els.length ? els[els.length - 1].innerText : '';
  }, SEL.assistant);

const lastAssistantMarkdown = () =>
  page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    const el = els[els.length - 1];
    if (!el) return '';
    const mds = el.querySelectorAll('.markdown');
    const root = mds.length ? mds[mds.length - 1] : el;
    const walk = (n) => {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase();
      const inner = () => Array.from(n.childNodes).map(walk).join('');
      switch (tag) {
        case 'pre': {
          const code = n.querySelector('code');
          const lang = (code?.className.match(/language-([\w-]+)/) || [])[1] || '';
          return '\n```' + lang + '\n' + (code ? code.textContent : n.textContent).replace(/\n$/, '') + '\n```\n';
        }
        case 'code':
          return '`' + n.textContent + '`';
        case 'strong':
        case 'b':
          return '**' + inner() + '**';
        case 'em':
        case 'i':
          return '*' + inner() + '*';
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          return '\n' + '#'.repeat(+tag[1]) + ' ' + inner().trim() + '\n';
        case 'p':
          return '\n' + inner() + '\n';
        case 'br':
          return '\n';
        case 'hr':
          return '\n---\n';
        case 'blockquote':
          return '\n' + inner().trim().split('\n').map((l) => '> ' + l).join('\n') + '\n';
        case 'li': {
          const ol = n.parentElement?.tagName === 'OL';
          const idx = Array.from(n.parentElement?.children || []).indexOf(n) + 1;
          return (ol ? idx + '. ' : '- ') + inner().trim().replace(/\n/g, '\n  ') + '\n';
        }
        case 'ul':
        case 'ol':
          return '\n' + inner();
        case 'a':
          return '[' + inner() + '](' + (n.getAttribute('href') || '') + ')';
        case 'table': {
          const rows = Array.from(n.querySelectorAll('tr')).map((tr) => '| ' + Array.from(tr.children).map((c) => c.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |');
          if (rows.length > 1) rows.splice(1, 0, '|' + ' --- |'.repeat(rows[0].split('|').length - 2));
          return '\n' + rows.join('\n') + '\n';
        }
        case 'button':
        case 'svg':
          return '';
        default:
          return inner();
      }
    };
    return walk(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }, SEL.assistant);

const ERROR_TEXT = /something went wrong|network error|too many requests|you've reached|you’ve reached|hit the .* limit|plan limit|try again later|error in message stream|conversation not found|unusual activity/i;

async function errorOnPage() {
  const body = await page.evaluate(() => document.body.innerText).catch(() => '');
  const m = body.match(ERROR_TEXT);
  return m ? m[0] : null;
}

async function currentModel() {
  return page.locator(SEL.modelButton).first().innerText({ timeout: 2000 }).catch(() => null);
}

async function typeIntoComposer(text) {
  const composer = page.locator(SEL.composer);
  await composer.click();
  try {
    await composer.fill(text);
  } catch {
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(text);
  }
  const typed = await composer.innerText();
  if (typed.trim().length < Math.min(20, text.trim().length)) throw new Error('composer did not accept the text');
}

async function sendAndWait(text) {
  await ensureReady();
  await pace();
  const before = await page.locator(SEL.assistant).count();
  const userBefore = await page.locator(SEL.user).count();
  await typeIntoComposer(text);
  const send = page.locator(SEL.send);
  await send.waitFor({ state: 'visible', timeout: 15000 });
  await send.click();
  const t0 = Date.now();
  log(`sent ${text.length} chars (${userBefore + 1} user msgs)`);

  await page
    .waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [SEL.assistant, before], { timeout: 120000 })
    .catch(async () => {
      const err = await errorOnPage();
      throw new Error(`no answer started within 120 s${err ? ` — page says: "${err}"` : ''}`);
    });
  const deadline = t0 + B.replyTimeoutSeconds * 1000;
  await page.locator(SEL.stop).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await page.locator(SEL.stop).waitFor({ state: 'hidden', timeout: Math.max(1000, deadline - Date.now()) }).catch(() => {
    throw new Error(`GPT was still generating after ${B.replyTimeoutSeconds} s`);
  });
  let last = '';
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const now = await lastAssistantText();
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (now.trim() && Date.now() - stableSince > 2000) break;
    await page.waitForTimeout(500);
  }
  let reply = await lastAssistantMarkdown();
  if (!reply.trim()) reply = last.trim();
  if (!reply.trim()) {
    const err = await errorOnPage();
    throw new Error(`empty reply${err ? ` — page says: "${err}"` : ''}`);
  }
  await page.waitForURL(/\/c\/[0-9a-f-]{8,}/, { timeout: 15000 }).catch(() => {});
  const durationMs = Date.now() - t0;
  log(`reply ${reply.length} chars in ${Math.round(durationMs / 1000)} s`);
  return { reply, url: page.url(), durationMs, model: await currentModel() };
}

async function gotoChat(url) {
  if (page.url().split('#')[0] === String(url).split('#')[0]) return;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

// ---- HTTP door ----
const routes = {
  '/status': async () => {
    const composer = await page.locator(SEL.composer).isVisible().catch(() => false);
    return { ok: true, ready: composer, url: page.url(), title: await page.title().catch(() => ''), model: await currentModel(), profile: profileDir, dev: DEV };
  },
  '/open': ({ message, projectUrl }) =>
    serialize(async () => {
      await gotoChat(projectUrl || 'https://chatgpt.com/');
      return sendAndWait(message);
    }),
  '/turn': ({ url, message }) =>
    serialize(async () => {
      if (url) await gotoChat(url);
      return sendAndWait(message);
    }),
  '/goto': ({ url }) => serialize(async () => (await page.goto(url, { waitUntil: 'domcontentloaded' }), { url: page.url() })),
  '/shutdown': async () => {
    setTimeout(() => context.close().finally(() => process.exit(0)), 100);
    return { ok: true };
  },
};
if (DEV) {
  routes['/eval'] = ({ code }) => serialize(() => page.evaluate(`(async () => { ${code} })()`));
  routes['/screenshot'] = () =>
    serialize(async () => {
      const p = join(HOME, 'screenshot.png');
      await page.screenshot({ path: p });
      return { path: p };
    });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.setEncoding('utf8');
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

await start();
const server = http.createServer(async (req, res) => {
  const route = routes[req.url];
  res.setHeader('content-type', 'application/json');
  if (!route) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: `no route ${req.url}` }));
  }
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const out = await route(body);
    res.end(JSON.stringify(out ?? {}));
  } catch (e) {
    log('error:', e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});
server.listen(B.port, '127.0.0.1', () => log(`door open on http://127.0.0.1:${B.port}${DEV ? ' (dev: /eval, /screenshot)' : ''}`));
process.on('SIGINT', () => context.close().finally(() => process.exit(0)));
