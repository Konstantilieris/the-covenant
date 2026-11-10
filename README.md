```
                                  /\
                                 /  \
                                /    \
                               /      \
                     _________/        \_________
                    /        THE COVENANT        \
                   /______________________________\
                   |   |   |    ______    |   |   |
                   |   |   |   /      \   |   |   |
                   |   |   |   |      |   |   |   |
                   |___|___|___|______|___|___|___|
               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

# THE COVENANT

*The counsel is heard. The king rides. Gandalf has the last word.*

**Claude Code and ChatGPT talk to each other about your codebase, with rules.** The
Covenant is an AI pair-review loop for Claude Code: a multi-agent code review in which
Claude Code and your ChatGPT argue one question with evidence, an independent agent
keeps them on the goal, you keep the last word, and every exchange is recorded in your
repo. No copy-paste between the two tabs, ever again.

[![test](https://github.com/Konstantilieris/the-covenant/actions/workflows/test.yml/badge.svg)](https://github.com/Konstantilieris/the-covenant/actions/workflows/test.yml) ![node](https://img.shields.io/badge/node-%E2%89%A5%2022-1f2a37) ![claude code](https://img.shields.io/badge/Claude%20Code-Th%C3%A9oden-b8650f) ![chatgpt](https://img.shields.io/badge/ChatGPT-Gr%C3%ADma-b8650f) [![license](https://img.shields.io/badge/license-MIT-1f2a37)](LICENSE)

## What it is: Claude Code + ChatGPT, reviewed

In the Golden Hall a king sits with his counsel at his ear. The counsel is clever,
tireless, and not to be trusted on charm. Then a wizard walks in, sees through the
words, and the king is free to decide. The Covenant is that hall, built for your
codebase: Claude Code is Théoden, your ChatGPT is Gríma, and you are Gandalf.

One question in. One recorded decision out. In between, two models that disagree on
purpose, a doorward who keeps the council on its goal, and a wizard who can stop or
steer at any moment. The record lives in your repo, on your branch, and reads in a
year.

## Roles (the council)

| Seat | Who | Duty |
| --- | --- | --- |
| **Gandalf** | you | signs the plan; speaks from either room and is answered first; the last word |
| **Théoden** | Claude Code | asks Gandalf for the goal when none was given, proposing candidates rather than assuming one; sets down his own position before the counsel speaks; verifies every claim in the code; does the work |
| **Gríma** | your ChatGPT, in a project with the context pack | answers the question cold, then argues from evidence; one recommendation; a stance on every reply; never trusted on charm |
| **Háma** | a small agent with no stake, the Doorward | reads each exchange against the goal; on-course, nudge, pause or close; a pause is a barred door |

## How a review runs (the order of a council)

```
GOAL        Gandalf's goal, or Théoden's proposals for Gandalf to choose from; never an assumption
BLIND TAKE  Gríma gets the question alone; the king's own position is already on record
POSITION    the king's position goes over; Gríma says where it differs and why
ARGUMENT    evidence or ask; accept with a change of position, reject with path:line
EACH TURN   Háma reads the last exchanges; nothing is sent until the Doorward has spoken
CLOSE       COVENANT CLOSE: <verdict>  from either seat, the cap, Háma, or Gandalf
```

Every reply from Gríma ends with `STANCE: hold | moved: <what> | agree` and
`CONFIDENCE: low | medium | high`. Three holds in a row mark the council stalled.
Háma's pause holds until Gandalf speaks (`covenant resume`); no message goes out
until Háma has reviewed the latest reply. A word from Gandalf, typed in Claude Code
or straight into the ChatGPT tab, is answered first and overrides both king and
counsel.

## Install (entering the hall)

The Covenant works for the repo you run it in. It looks for `.covenant.json` at the
git root; the project is named after the repo folder.

```bash
git clone https://github.com/Konstantilieris/the-covenant.git ../the-covenant
cd ../the-covenant && npm install && npm install -g .     # covenant, covenant-setup on the PATH
cd <your repo>                                            # on a feature branch
covenant-setup
```

`covenant-setup` writes the marker and `docs/covenant/` (the counsel's persona,
owner notes, brief, history, pack spec, annals), the launcher `tools/covenant.mjs`,
the `/covenant` and `/covenant-setup` skills and the Háma agent under `.claude/`,
the allow rules and the Stop hook into `.claude/settings.json`, and the gitignore
line for the derived pack; builds the pack; prints a doctor report; commits only
those files on your branch. Pass `--project-url <your ChatGPT project URL>` when you
have one; `--no-commit` to look first. Run it in a terminal or with `!` from the
Claude Code prompt: Claude Code does not let Claude change permission settings, even
a repo's. Or type `/covenant-setup` in Claude Code and let the skill drive it.

Everyone after that clones the codebase: the wiring arrives with it, the launcher
fetches the Covenant on first use, and `/covenant-setup` makes their own ChatGPT
project through the extension. That URL is the only per-person setting.

**Requirements:** Claude Code with the Agent tool, Node 22 or newer, git. Extension
lane: the Claude in Chrome extension and a ChatGPT account (Plus or better, for
projects) logged in in that Chrome. Codex lane: the Codex CLI signed in with ChatGPT.

## Commands (the king's commands)

In Claude Code: `/covenant <question>`. The skill does the rest. The CLI underneath,
run from inside the repo as `node tools/covenant.mjs <cmd>` or `covenant <cmd>`:

| Command | Does |
| --- | --- |
| `open --title --goal --question [--mode build] [--context a,b] [--cap N] [--no-blind]` | opens a council; no goal, no council |
| `record --author claude\|gpt\|human\|watch` | logs a message, moves the state, runs the guard |
| `outgoing --clip` | the exact text to send, on the clipboard; refuses while the door is barred or Háma has not spoken |
| `watch-brief` · `context --clip` · `attach --file` | Háma's brief; the goal context; a file for the counsel |
| `plan propose --file` · `plan sign` · `step start` · `step done --evidence` | build mode: a plan reviewed until agreed, signed by Gandalf, then executed one step at a time with evidence |
| `pause` · `resume` · `stop` · `close` | Gandalf's controls |
| `status` · `threads` · `render` · `doctor` | where things stand |
| `pack` · `sources` · `instructions --clip` · `project --url` | the ChatGPT project's context |
| `setup` · `wire` · `init` · `install` · `uninstall` | entering the hall |

## The record (the annals)

Each council is a directory under `docs/covenant/threads/<date>-<slug>/`: the
metadata, the brief the counsel was given, every message as an append-only event
log, and a rendered transcript. At close the annals (`docs/covenant/ledger.md`) get
one line (verdict, who closed, the counsel's last stance) and the council is
committed on the current branch with `git commit --only`, never on `main`.
`docs/covenant/` also holds the counsel's persona, the owner notes, the one-page
brief, the history, and the pack spec that builds the context the ChatGPT project
reads.

## Build mode: AI pair programming with review (the muster)

A `build` council ends in agreed, verified changes, not a verdict. Gríma lists the
requirements; Théoden proposes a numbered plan with files and tests; Gríma reviews it
with a structured verdict until no blocker or major objection remains; Gandalf signs
the plan; then the king does one step at a time, sends the evidence (the diff, the
test output, a claim), and Gríma checks each step against the plan, in the codex
lane by opening the files and running the tests himself. A step is sent back at most
twice, then Gandalf decides. Build councils run on the codex lane by default.

## Safety and the lanes (the doorward's law)

- **The barred door.** A paused council takes no new message from the king and sends
  nothing; only `covenant resume`, Gandalf's word, opens it. A stalled council forces
  Háma. A time budget pauses a council left open too long.
- **Háma, the Watch agent.** A Haiku agent that reads only the goal, the last three
  exchanges, the stance history and the budget, and may pause for off-goal,
  looping, scope replacement, a secret in a message, or an instruction to act
  outside the council.
- **Four lanes.** `extension` (default): Claude drives your own logged-in Chrome
  through the Claude in Chrome extension, one tab, human cadence (at least 20 s
  between sends, 60 a day), no disguise. `codex`: the Codex CLI signed in with your
  ChatGPT account; the counsel reads the repo itself; the Stop hook makes it
  automatic; the default for build councils. `openai`: the Responses API on your own
  key, for unattended councils. `browser`: a Playwright daemon on a separate
  profile. The extension and browser lanes are automated access to chatgpt.com,
  which OpenAI's terms do not allow; the account owner accepts that. The codex and
  openai lanes are inside the rules.
- **Slack mirror, optional.** With `slack.cli` in `.covenant.json`, each council gets
  a channel, every message is posted under its seat, Gandalf's replies there are
  pulled in before the next send, and the channel is archived at close.
- **The counsel is never told it is Gríma.** The name lives in everything humans
  read; the instructions pasted into ChatGPT describe the seat, "the counsel at the
  king's table, whose every word is tested", so the model is never asked to play a
  traitor. The reader gets the wink.
- **Secrets.** The annals redact common token shapes before writing; the king never
  relays environment values; Háma pauses on a secret he sees.

## FAQ

**Can Claude Code talk to ChatGPT?** Yes, through the Covenant: Claude Code drives
your own ChatGPT tab through the Claude in Chrome extension, or reaches the same
account through the Codex CLI, or the OpenAI API on your key.

**Is this an MCP server or a ChatGPT plugin?** No. A ChatGPT plugin can only answer
when a human types; it cannot drive a conversation. The Covenant lives on the Claude
Code side as a skill, a CLI and a small agent, and treats ChatGPT as the counsel.

**Does it work without the Chrome extension?** Yes: the codex lane (Codex CLI, your
ChatGPT subscription, the counsel reads the repo itself) and the openai lane (your API
key). Both stay inside OpenAI's terms.

**Is it allowed by OpenAI's terms?** The codex and openai lanes are. The extension
and browser lanes automate chatgpt.com, which the terms do not allow; that is the
account owner's call, stated plainly here rather than hidden.

**What does it cost?** Node, your existing Claude Code and ChatGPT subscriptions, and
one small Haiku call per exchange for Háma. The openai lane bills per token.

**Where is the record?** In your repo, under `docs/covenant/`, committed on your
branch. Nothing is sent anywhere else unless you turn the Slack mirror on.

## Layout (the map of the hall)

```
bin/covenant.mjs · bin/covenant-setup.mjs    CLI, and the one-word install
src/theme.mjs         the seats: Gandalf, Théoden, Gríma, Háma
src/config.mjs        resolves the project from the cwd; settings layers
src/ledger.mjs        councils: thread.json, brief.md, events.jsonl, transcript.md
src/brief.mjs         goal → persona → owner → brief → annals → history → council
src/turn.mjs          exchange (hook lanes); record, outgoing, the door, Háma's brief, close
src/build.mjs         build mode: requirements, plan, verdicts, signature, steps, evidence
src/context.mjs       the goal context for one council
src/pack.mjs          the context pack for the ChatGPT project
src/doctor.mjs        requirement checks
src/setup.mjs · src/wire.mjs · src/install.mjs    one-command install; the wiring as project files; user-level install
src/slack.mjs         the Slack mirror · src/pace.mjs  cadence · src/clipboard.mjs  file → clipboard → paste
src/adapters/         codex, openai, browser · src/browser-daemon.mjs
hooks/claude-stop.mjs the Stop hook (hook lanes)
agents/               covenant-watch: Háma
skills/               covenant, covenant-setup (+ the chatgpt-page.js helper)
template/             what setup seeds into a repo's docs/covenant/, and the launcher
tools/distil-export.mjs   ChatGPT data export → history.md draft · tools/social-preview.mjs
```

## Status

v0.1. The bookkeeping, the barred door, Háma, build mode, the installer and the
extension-lane page driver are tested; the first full council on a live question is
the next entry in the annals.
