---
name: covenant-setup
description: Install the Covenant for the repo you are in, in one go — check the requirements, fetch the Covenant if this machine lacks it, run `covenant setup` (marker, data dir, launcher, skills, Háma agent, allow rules, hook, pack, commit), create the ChatGPT project through the Claude in Chrome extension, add the sources, smoke the loop. Use when the user says "/covenant-setup", "install the covenant", "set up the covenant".
disable-model-invocation: true
---

# /covenant-setup — install the Covenant here

`$ARGUMENTS`: `[--lane extension|codex] [--project-url <ChatGPT project URL>] [--skip-project]`

The Covenant is a dialogue loop between Claude Code (Théoden) and the owner's
ChatGPT (Gríma), recorded in the codebase under `docs/covenant/`, watched by
an agent. It works for **the repo you are in**; the project is named after the repo
folder. Steps that need the human's hands say so; never type credentials; never open
a second browser window.

## 0. Requirements — check, report, stop until fixed

| Check | How | If missing |
| --- | --- | --- |
| Node ≥ 22, git, npm | `node --version`, `git --version`, `npm --version` | ask the human to install them |
| inside a git repo, on a feature branch | `git rev-parse --show-toplevel`, `git branch --show-current` | the Covenant commits on the current branch, never main: ask for a feature branch |
| Claude in Chrome extension connected (extension lane) | `tabs_context_mcp` answers | the human installs it at claude.ai/chrome and restarts Chrome; or `--lane codex` |
| ChatGPT logged in in that Chrome (extension lane) | `navigate` the extension's one tab to `https://chatgpt.com/`; a composer, not a Log in button | ask the human to log in there, then continue |
| Codex CLI logged in (codex lane) | `codex --version`; `codex login status` | `npm i -g @openai/codex && codex login` (the human) |
| Slack mirror (optional) | `.covenant.json` → `slack.cli` names a CLI | mirror stays off |

Print the table with ✓/✗ first. Choose the lane: extension if the extension and
ChatGPT are there, else codex, else stop and say what is missing.

## 1. The Covenant on this machine

`command -v covenant-setup` → present: go on. Absent: find the checkout
(`~/.covenant/config.json` → `root`, else `../the-covenant` next to this repo), fetch it
if there is none, and put the commands on the PATH:

```bash
git clone https://github.com/Konstantilieris/the-covenant.git ../the-covenant   # only if absent
cd ../the-covenant && npm install && npm install -g . && cd -
```

That gives `covenant` and `covenant-setup` everywhere on this machine.

## 2. One word for this repo

```bash
covenant-setup [--project-url <url>] [--browser server]
```

Run from the repo root. It writes `.covenant.json` and `docs/covenant/` (skipping what
exists; the project is named after the repo folder), the launcher `tools/covenant.mjs`,
the skills and Háma agent under `.claude/`, the allow rules and the Stop hook into
`.claude/settings.json`, the gitignore line for the pack; builds the pack; prints a
doctor report; commits only those files on the current branch.

**If this command is refused in the session, do not retry it.** Show the human exactly
this line and wait until they say it ran:

```
! covenant-setup
```

Then read its report: fix what you can (`node tools/covenant.mjs pack`), tell the human
the rest. From here the CLI is `node tools/covenant.mjs <cmd>`, run as the first token
of the Bash command.

## 3. The project files

With the human: `docs/covenant/persona.md` (how Gríma behaves), `owner.md` (who
they are, how they like to work), `brief.md` (the project in a page), `pack.json` (what
the context pack bundles). If a teammate already filled them, leave them. Then
`node tools/covenant.mjs pack` again if `pack.json` changed.

## 4. The ChatGPT project (extension lane)

`node tools/covenant.mjs project` → if it already shows a `projectUrl`, or `--skip-project`
was given, skip 1–3 and go to the Sources (4) with the existing project open in the tab.
Otherwise, in the extension's tab, logged in as the human:

1. Sidebar → "+" next to **Projects** → Create project: name `<repo> Covenant`, memory
   **Default** → Create.
2. Project actions (⋯) → **Project settings** → Instructions:
   `node tools/covenant.mjs instructions --clip`, click the field, `ctrl+v`, confirm the
   length with `javascript_tool` (`document.querySelector('[role=dialog] textarea').value.length`), **Save**.
3. `node tools/covenant.mjs project --url <the project URL, …/g/g-p-…/project>`.
4. Sources: `node tools/covenant.mjs sources` lists the files. For each:
   `node tools/covenant.mjs clip --file <path>`; **Sources** tab → **Add sources** →
   **Paste text** → title = file name → click the text area → `ctrl+v` → **Save**; confirm
   the name appears. If a step is refused, stop and ask the human to drag the remaining
   files from `docs/covenant/files/` into Sources themselves.
5. In the project composer, pick **Thinking** in the model picker once.

Each person has their own ChatGPT project; the repo files are shared.

## 5. Smoke

```bash
node tools/covenant.mjs open --title "setup smoke" --goal "Prove the loop end to end: one message in, one reply recorded." --question "Reply with the single word pong." --cap 1 --no-blind
node tools/covenant.mjs outgoing --council <dir> --message "Setup smoke: reply with the single word pong." --clip
```

Extension lane: `navigate` to the project URL, install the page helper
(`node tools/covenant.mjs helper` → `javascript_tool`), `__covenant.focus(); __covenant.mark()`,
`ctrl+a`, `Delete`, `ctrl+v`, `Return`, `await __covenant.wait(20000)` until done,
`__covenant.reply()`, write it to `<dir>/gpt-1.md`,
`node tools/covenant.mjs record --council <dir> --author gpt --message-file <dir>/gpt-1.md --chat-url <url>`.
Codex lane: `node tools/covenant.mjs turn --council <dir> --message "Setup smoke: reply with the single word pong."`.
The council closes on the cap; `node tools/covenant.mjs councils` lists it closed.

## 6. Report

Say what is installed and where, the lane, the project URL, which files are in Sources,
the doctor result, that the commit is on the current branch and not pushed, and that
Claude Code must be restarted in this repo for `/covenant` and Háma agent to load.
