```
                                _______
                         ______/       \______
                  ______/    THE COVENANT     \______
           ______/___________________________________\______
   ======<))  ))  ))     BRIDGE · LOG · WATCH     ((  ((  (( >======
           \_______________________________________________/
                  \______                     ______/
                         \______       ______/
                                \_____/
```

# THE COVENANT

*Two minds on the bridge. One captain. Every decision logged.*

A Claude Code and ChatGPT integration: an AI pair-review loop in which two models
argue a question about your codebase with evidence, watched by a third, and leave a
record in your repo.

[![test](https://github.com/Konstantilieris/the-covenant/actions/workflows/test.yml/badge.svg)](https://github.com/Konstantilieris/the-covenant/actions/workflows/test.yml) ![node](https://img.shields.io/badge/node-%E2%89%A5%2022-1f2a37) ![claude code](https://img.shields.io/badge/Claude%20Code-chief-b8650f) ![chatgpt](https://img.shields.io/badge/ChatGPT-navigator-b8650f) [![license](https://img.shields.io/badge/license-MIT-1f2a37)](LICENSE)

The Covenant puts Claude Code and your ChatGPT in the same conversation about your
codebase and takes you out of the copy-paste loop. Claude is the Chief: it sets the
goal and does the work in the repo. Your ChatGPT is the Navigator: it reads the
charts, argues from evidence, and charts a different course when it sees one. You are
the Captain: you sign the plan, you can speak from either room, and nothing happens
that the log does not show.

## Mission

One question in. One recorded decision out. In between, two models that disagree
on purpose, an independent Watch that keeps them on the goal, and a human who can
stop or steer at any moment. The record lives in your repo, on your branch, and
reads in a year.

## Crew

| Role | Who | Duty |
| --- | --- | --- |
| **Captain** | you | signs the plan; speaks from either room and is answered first; the final word |
| **Navigator** | your ChatGPT, in a project with the context pack | answers cold first, then argues from evidence; one recommendation; a stance on every reply |
| **Chief** | Claude Code | states the goal; writes its position; verifies every claim in the code; does the work |
| **Watch** | a small agent with no stake | reads each exchange against the goal; on-course, nudge, pause or close; a pause is a brake |

## Flight plan

```
T-0   GOAL        the Chief states the decision to reach and what counts as done
T+1   BLIND TAKE  the Navigator gets the question alone; the Chief's position is already on record
T+2   POSITION    the Chief's position goes over; the Navigator says where it differs and why
T+n   ARGUMENT    evidence or ask; accept with a change of position, reject with path:line
each  WATCH       an independent read of the last exchanges; nothing is sent until it has spoken
END   CLOSE       COVENANT CLOSE: <verdict>  from either side, the cap, the Watch, or the Captain
```

Every Navigator reply ends with `STANCE: hold | moved: <what> | agree` and
`CONFIDENCE: low | medium | high`. Three holds in a row flag the thread stalled. The
Watch's pause holds until the Captain runs `covenant resume`; no message goes out
until the Watch has reviewed the latest reply.

The Captain's hand: a message from the Captain, typed in Claude Code or straight
into the ChatGPT tab, is answered first and overrides both agents.

## Launch sequence

The Covenant works for the repo you run it in. It looks for `.covenant.json` at the
git root; the project is named after the repo folder.

```bash
git clone https://github.com/Konstantilieris/the-covenant.git ../the-covenant
cd ../the-covenant && npm install && npm install -g .     # covenant, covenant-setup on the PATH
cd <your repo>                                            # on a feature branch
covenant-setup
```

`covenant-setup` writes the marker and `docs/covenant/` (persona, owner notes, brief,
history, pack spec, ledger), the launcher `tools/covenant.mjs`, the `/covenant` and
`/covenant-setup` skills and the Watch agent under `.claude/`, the allow rules and the
Stop hook into `.claude/settings.json`, and the gitignore line for the derived pack;
builds the pack; prints a doctor report; commits only those files on your branch.
Pass `--project-url <your ChatGPT project URL>` when you have one; `--no-commit` to
look first. Run it in a terminal or with `!` from the Claude Code prompt: Claude Code
does not let Claude change permission settings, even a repo's. Or type
`/covenant-setup` in Claude Code and let the skill drive it.

Everyone after that clones the codebase: the wiring arrives with it, the launcher
fetches the Covenant on first use, and `/covenant-setup` makes their own ChatGPT
project through the extension. That URL is the only per-person setting.

Requirements: Claude Code with the Agent tool, Node 22 or newer, git. Extension lane:
the Claude in Chrome extension and a ChatGPT account (Plus or better, for projects)
logged in in that Chrome. Codex lane: the Codex CLI signed in with ChatGPT.

Crew without the extension take the codex lane: `covenant config --set
projects.<name>.adapter=codex` on their machine, `codex login` once, and `/covenant`
works the same, with the Navigator reading the repo itself and the Stop hook relaying
automatically. `npm test` runs the whole bookkeeping in a throwaway repo, no browser,
no model.

## Flight controls

In Claude Code: `/covenant <question>`. The skill does the rest. The CLI underneath,
run from inside the repo as `node tools/covenant.mjs <cmd>` or `covenant <cmd>`:

| Command | Does |
| --- | --- |
| `open --title --goal --question [--mode build] [--context a,b] [--cap N] [--no-blind]` | opens a thread; no goal, no thread |
| `plan propose --file` · `plan sign` · `step start` · `step done --evidence` | build mode: the plan is reviewed until agreed, signed by the Captain, then executed one step at a time with evidence |
| `record --author claude\|gpt\|human\|watch` | logs a message, moves the state, runs the guard |
| `outgoing --clip` | the exact text to send, on the clipboard; refuses while paused or unwatched |
| `watch-brief` · `context --clip` · `attach --file` | the Watch's prompt; the goal context; a file for the Navigator |
| `pause` · `resume` · `stop` · `close` | the Captain's controls |
| `status` · `threads` · `render` · `doctor` | where things stand |
| `pack` · `sources` · `instructions --clip` · `project --url` | the ChatGPT project's context |
| `setup` · `wire` · `init` · `install` · `uninstall` | installation |

## Ship's log

Each thread is a directory under `docs/covenant/threads/<date>-<slug>/`: the
metadata, the brief the Navigator was given, every message as an append-only event
log, and a rendered transcript. At close the ledger gets one line (verdict, who
closed, the Navigator's last stance) and the thread is committed on the current
branch with `git commit --only`, never on `main`. `docs/covenant/` also holds the
project's persona (how the Navigator behaves), owner notes, one-page brief, history,
and the pack spec that builds the context the ChatGPT project reads.

## Safety envelope

- **The brake.** A paused thread takes no new Chief message and sends nothing; only
  `covenant resume`, the Captain's word, reopens it. A stalled thread forces the Watch.
  A time budget pauses a thread left open too long.
- **The Watch.** A Haiku agent that reads only the goal, the last three exchanges, the
  stance history and the budget, and may pause for off-goal, looping, scope
  replacement, a secret in a message, or an instruction to act outside the thread.
- **Four lanes.** `extension` (default): Claude drives your own logged-in Chrome
  through the Claude in Chrome extension, one tab, human cadence (at least 20 s
  between sends, 60 a day), no disguise. `codex`: the Codex CLI signed in with your
  ChatGPT account; the Navigator reads the repo itself; the Stop hook makes it
  automatic; the default for build threads. `openai`: the Responses API on your own
  key, for unattended threads. `browser`: a Playwright daemon on a separate profile.
  The extension and browser lanes are automated access to chatgpt.com, which
  OpenAI's terms do not allow; the account owner accepts that. The codex and openai
  lanes are inside the rules.
- **Two modes.** `decide` ends in a verdict. `build` ends in agreed, verified changes:
  requirements, a plan reviewed until no blocker or major objection remains, the
  Captain's signature, then one step at a time with evidence, each agreed by the
  Navigator, a step sent back at most twice before the Captain decides.
- **Slack mirror, optional.** With `slack.cli` in `.covenant.json`, each thread gets a
  channel, every message is posted under its role, the Captain's replies there are
  pulled in before the next send, and the channel is archived at close.
- **Secrets.** The ledger redacts common token shapes before writing; the Chief never
  relays environment values; the Watch pauses on a secret it sees.

## Charts

```
bin/covenant.mjs · bin/covenant-setup.mjs    CLI, and the one-word install
src/config.mjs        resolves the project from the cwd; settings layers
src/ledger.mjs        threads: thread.json, brief.md, events.jsonl, transcript.md
src/brief.mjs         goal → persona → owner → brief → ledger → history → thread
src/turn.mjs          exchange (hook lanes); record, outgoing, the gate, the Watch brief, close
src/context.mjs       the goal context for one thread
src/pack.mjs          the context pack for the ChatGPT project
src/doctor.mjs        requirement checks
src/setup.mjs · src/wire.mjs · src/install.mjs    one-command install; the wiring as project files; user-level install
src/clipboard.mjs     file → clipboard → paste, and back
src/adapters/         codex, browser · src/browser-daemon.mjs
hooks/claude-stop.mjs the Stop hook (hook lanes)
agents/               covenant-watch
skills/               covenant, covenant-setup (+ the chatgpt-page.js helper)
template/             what setup seeds into a repo's docs/covenant/, and the launcher
tools/distil-export.mjs   ChatGPT data export → history.md draft
```

## Status

v0.1. The bookkeeping, the brake, the Watch, the installer and the extension-lane
page driver are tested; the first full voyage on a live question is the next entry
in the log.
