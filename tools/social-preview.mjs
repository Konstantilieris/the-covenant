#!/usr/bin/env node
// Render the social preview (1280×640 PNG) from the README's frigate, with headless
// Chrome through Playwright. Upload the result by hand: repository Settings → Social
// preview (there is no API for it).
//
//   node tools/social-preview.mjs [out.png]
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(ROOT, 'docs', 'social-preview.png'));
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const ship = (readme.match(/```\n([\s\S]*?)\n```/) || [null, ''])[1];

const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:640px;background:#0d1218;color:#e6ebf1;font-family:'Cascadia Mono','Consolas','DejaVu Sans Mono',monospace;overflow:hidden}
  .wrap{position:relative;width:1280px;height:640px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
  pre{margin:0;font-size:19px;line-height:1.2;color:#f0a23a;white-space:pre}
  h1{margin:0;font-family:'Segoe UI',Arial,sans-serif;font-weight:700;letter-spacing:.14em;font-size:36px;color:#e6ebf1}
  p{margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:20px;color:#93a1b3}
  .stars{position:absolute;inset:0;background:
    radial-gradient(1px 1px at 120px 80px,#e6ebf1 60%,transparent 61%),
    radial-gradient(1px 1px at 980px 120px,#e6ebf1 60%,transparent 61%),
    radial-gradient(1.5px 1.5px at 1160px 520px,#e6ebf1 60%,transparent 61%),
    radial-gradient(1px 1px at 300px 560px,#e6ebf1 60%,transparent 61%),
    radial-gradient(1px 1px at 700px 40px,#e6ebf1 60%,transparent 61%),
    radial-gradient(1px 1px at 60px 420px,#e6ebf1 60%,transparent 61%);opacity:.7}
</style><div class="wrap"><div class="stars"></div><pre>${ship.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre><h1>THE COVENANT</h1><p>Two minds on the bridge. One captain. Every decision logged.</p></div>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
