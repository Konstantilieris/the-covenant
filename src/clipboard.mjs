// System clipboard, both ways. Outgoing messages travel file → clipboard → paste into
// the ChatGPT composer; a reply copied with ChatGPT's own Copy button comes back the
// same road. UTF-8 throughout, so non-ASCII text survives.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function setClipboard(text) {
  if (process.platform === 'win32') {
    const dir = mkdtempSync(join(tmpdir(), 'covenant-'));
    const f = join(dir, 'clip.txt');
    writeFileSync(f, text, 'utf8');
    const r = spawnSync('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Value ([IO.File]::ReadAllText('${f.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`], { encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    if (r.status !== 0) throw new Error(`Set-Clipboard failed: ${r.stderr}`);
    return;
  }
  const cmd = process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard'];
  const r = spawnSync(cmd[0], cmd.slice(1), { input: text, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd[0]} failed: ${r.stderr}`);
}

export function getClipboard() {
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Get-Clipboard failed: ${r.stderr}`);
    return r.stdout.replace(/\r\n/g, '\n').replace(/\n$/, '');
  }
  const cmd = process.platform === 'darwin' ? ['pbpaste'] : ['xclip', '-selection', 'clipboard', '-o'];
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd[0]} failed: ${r.stderr}`);
  return r.stdout;
}
