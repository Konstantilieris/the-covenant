# Launch notes

Drafts for the Reach phase of the roadmap. Gandalf posts; nothing here is sent by
Théoden.

## awesome-claude-code (pull request, one line)

Target: `hesreallyhim/awesome-claude-code`, section for workflows or integrations
(read `CONTRIBUTING.md` there first; the list has its own submission rules).

```
- [The Covenant](https://github.com/Konstantilieris/the-covenant) — Claude Code and your ChatGPT argue a question about your codebase with evidence, watched by a third agent; goal first, blind first take, Gandalf who can override; every council recorded in your repo.
```

## Announcement (Claude subreddit, Show HN, X)

**Title:** The Covenant: Claude Code and ChatGPT talk it through about your codebase; you stay the captain

**Body:**

I kept copy-pasting between Claude Code and ChatGPT: Claude's position into ChatGPT,
ChatGPT's answer back into Claude. The Covenant removes the pasting and adds the
rules a real second opinion needs.

- Théoden (Claude Code) states the goal and takes a position in writing before the
  Gríma (your ChatGPT, in a project with your repo's context) sees it.
- Gríma answers the question cold, then reads the position and says where it
  differs, with evidence. Every reply ends with a stance line.
- Háma, a small agent with no stake, reads each exchange against the goal and can
  pause the council. Nothing is sent until it has spoken.
- You, Gandalf, can speak from either room and are answered first. You sign plans
  before anything executes.
- Every council is committed to your repo, on your branch.

Install: `npm i -g the-covenant`, then `covenant-setup` inside your repo. Node 22+,
Claude Code, the Claude in Chrome extension and a ChatGPT login; or the Codex CLI
lane, which stays inside OpenAI's terms and lets Gríma read the repo itself.

MIT. First release; the log is open. https://github.com/Konstantilieris/the-covenant

## Social preview

`docs/social-preview.png` (1280×640). Upload: repository Settings → Social preview.
Regenerate after a README change: `node tools/social-preview.mjs`.
