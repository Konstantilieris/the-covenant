// Covenant page helper for chatgpt.com. Installed into the tab with the Claude in
// Chrome javascript_tool (paste this whole file as the code); it defines
// window.__covenant and returns the page state. Re-install after any navigation.
//
//   __covenant.focus()        focus the composer; returns { chars }
//   __covenant.mark()         remember how many replies exist (call before sending)
//   __covenant.composerText() what the composer holds right now
//   __covenant.state()        { url, turns, lastState, generating, replies, composerChars }
//   await __covenant.wait(ms) resolves { done, ... } once a NEW reply is complete and stable
//   __covenant.reply()        the last reply as markdown
//   __covenant.userMessages() every user message in the chat (to spot the Captain's)
//   __covenant.resync()       { url, userMessages, replies, generating, lastReply }
//
// Page vocabulary seen 2026-11-10: composer = contenteditable div aria-label "Ask ChatGPT"
// (or "New chat in <project>"); each turn carries data-talvt-turn-state
// in_progress|complete; the reply body is [data-markdown-text-style="assistant-message"];
// a "Stop" button exists while generating.
(() => {
  const SEL = {
    composer: '[contenteditable="true"][aria-label^="Ask"], [contenteditable="true"][aria-label^="New chat"], #prompt-textarea, [contenteditable="true"]',
    turn: '[data-talvt-turn-state]',
    reply: '[data-markdown-text-style="assistant-message"]',
    stop: 'button[aria-label="Stop"], button[aria-label*="Stop" i]',
    user: '[data-user-message-bubble]',
  };
  const q = (s) => Array.from(document.querySelectorAll(s));
  const last = (s) => {
    const a = q(s);
    return a[a.length - 1] || null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const serialize = (root) => {
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
  };

  const state = () => {
    const t = last(SEL.turn);
    const lastState = t ? t.getAttribute('data-talvt-turn-state') : null;
    return {
      url: location.href,
      turns: q(SEL.turn).length,
      lastState,
      generating: !!document.querySelector(SEL.stop) || lastState === 'in_progress',
      replies: q(SEL.reply).length,
      userMessages: q(SEL.user).length,
      composerChars: (last(SEL.composer)?.innerText || '').length,
      marked: window.__covenant?._marked ?? null,
    };
  };

  window.__covenant = {
    v: 3,
    _marked: window.__covenant?._marked ?? null,
    focus() {
      const ed = last(SEL.composer);
      if (!ed) throw new Error('no composer on this page');
      ed.focus();
      return { chars: ed.innerText.length };
    },
    mark() {
      this._marked = q(SEL.reply).length;
      return { marked: this._marked };
    },
    composerText() {
      return last(SEL.composer)?.innerText || '';
    },
    state,
    async wait(ms = 20000) {
      const t0 = Date.now();
      const need = (this._marked ?? -1) + 1;
      while (Date.now() - t0 < ms) {
        const s = state();
        if (s.replies >= need && !s.generating && s.lastState === 'complete') {
          const a = last(SEL.reply)?.innerText || '';
          await sleep(1500);
          const b = last(SEL.reply)?.innerText || '';
          if (a === b && b.trim()) return { done: true, ...state() };
        }
        await sleep(500);
      }
      return { done: false, ...state() };
    },
    reply() {
      const md = last(SEL.reply);
      return md ? serialize(md) : '';
    },
    userMessages() {
      return q(SEL.user).map((e) => e.innerText.trim());
    },
    resync() {
      return { url: location.href, userMessages: this.userMessages(), replies: q(SEL.reply).length, generating: state().generating, lastReply: this.reply() };
    },
  };
  return { installed: true, ...state() };
})();
