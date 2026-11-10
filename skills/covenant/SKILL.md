---
name: covenant
description: Open a Covenant thread — a recorded dialogue between this Claude Code session (the Chief) and the owner's ChatGPT (the Navigator), driven through the Claude in Chrome extension with no copy-paste by the owner (the Captain), watched by the covenant-watch agent, recorded in this repo under docs/covenant/. Use when the user says "/covenant", "ask GPT", "covenant on this", "get ChatGPT's opinion", "run this by ChatGPT".
disable-model-invocation: true
---

# /covenant — the Chief and the Navigator talk it through; the Captain decides

`$ARGUMENTS`: `<question | file path | <ISSUE-KEY>> [--cap N] [--context p1,p2] [--no-blind] [--lane extension|codex]`

Roles: **the Captain** is the owner; **the Navigator** is their ChatGPT, in this
project's ChatGPT project; **the Chief** is you. The thread runs until one side
writes `COVENANT CLOSE: <verdict>`, the cap (default 8 Navigator turns) is reached,
the Watch or the Captain stops it. Everything is recorded under this repo's
`docs/covenant/threads/<date>-<slug>/` and committed on the current branch at close.

CLI: `node {{ROOT}}/bin/covenant.mjs <cmd>` — written `covenant` below. Run it as the
**first token of the Bash command** (no `cd … &&` in front: the session's working
directory is the repo, and the allow rule matches the command's start); pass
`--cwd "$PWD"` if ever in doubt. Browser: the `mcp__claude-in-chrome__*` tools (load
them with ToolSearch first; use `browser_batch` for sequences). **One tab only**: the
extension's own tab in the Captain's Chrome; never open extra windows or tabs.

## 0. Preflight

- `covenant doctor` → every check ✓ (the project URL set, the pack built, not on
  main, at most one open thread). Fix what it names or tell the Captain.
- `covenant status` → if `openThreads` lists a thread of yours, continue it (see
  Resume) instead of opening another.
- `tabs_context_mcp` → if the group has no tab, `navigate` (without tabId) creates
  the one tab. If ChatGPT is not logged in there, stop and say so.
- `--lane codex`: no browser; see "Codex lane" at the end.

## 1. The goal, the question, the context

- File path → read it. `<ISSUE-KEY>` → fetch the issue. Free text → as is.
- **Write the goal yourself, two sentences:** the decision this thread must reach,
  and what counts as done (for example: "Decide where the quiet-hours shift lives.
  Done when we have one answer, the file it goes in, and the one reason it is not
  the other place."). No goal, no thread.
- Pick the 2–6 files that matter (`--context`). The Navigator cannot read the repo:
  quote the decisive lines with `path:line` in your messages. The project already
  holds the context pack; do not paste it.

## 2. Open

```bash
covenant open --title "<≤ 60 chars>" --goal "<two sentences>" --question-file <file> --context <p1,p2> --cap <N>
covenant context --thread <dir> --clip     # the goal context: pack sections + the named files, ≤ 12 KB
```

`open` prints the thread dir `<dir>` and `projectUrl`. `context` puts a goal-specific
attachment on the clipboard: paste it into the composer **before** the first message's
text (it becomes an attachment chip), then the text. Message files live in `<dir>`:
`claude-<n>.md`, `gpt-<n>.md`.

## 3. The exchanges

**Blind first take (default).** Write your position to `<dir>/claude-1.md` and
record it first (the timestamp proves it predates the Navigator's take). Then send
the question alone, record the Navigator's take, then send your position:

1. `covenant record --thread <dir> --author claude --message-file <dir>/claude-1.md`
2. `covenant outgoing --thread <dir> --clip` (no message file → brief + question only)
   → send (b) with the goal context chip first, wait (c), read and record (d), Watch (e).
3. `covenant outgoing --thread <dir> --message-file <dir>/claude-1.md --clip` → send,
   wait, record, Watch. Do **not** record claude-1 again. From here on, (a)–(e).

`--no-blind` sends brief + position together.

**a. Your message.** Write it to `<dir>/claude-<n>.md`: position, evidence (quoted
lines with paths), the questions for the Navigator. Under ~500 words. If the Watch
said `nudge`, open with `Watch: <its nudge>`. If the Captain spoke, open with
`From the Captain: <their words>` and answer it before anything else. Then:

```bash
covenant record --thread <dir> --author claude --message-file <dir>/claude-<n>.md
covenant outgoing --thread <dir> --message-file <dir>/claude-<n>.md --clip
```

`record` returns `kind`; `closed-by-claude` → step 4. `outgoing` refuses while the
thread is paused or the Watch has not reviewed the latest reply; otherwise it puts
the exact text on the clipboard and returns `openIn`: on the first send `navigate`
there (the project page) so the chat is created inside the project; later, stay in
the chat.

**b. Send it** — one `browser_batch`:

1. `javascript_tool`: if `!window.__covenant || __covenant.v !== 3`, run the full
   output of `covenant helper` first. Then `__covenant.focus(); __covenant.mark()`.
2. `computer` key `ctrl+a`, key `Delete` (clears any draft).
3. `computer` key `ctrl+v`, wait 1. (First send only: paste the goal context first,
   wait 2, confirm the chip, then `covenant outgoing … --clip` and paste again.)
4. `javascript_tool`: `__covenant.composerText().length` within 10 of `chars` from
   `outgoing`; if not, repeat 2–3 once, then stop and tell the Captain.
5. `computer` key `Return`, wait 10.

**c. Wait.** `javascript_tool`: `await __covenant.wait(20000)` — repeat that one call
until `done: true`. Thinking takes minutes; send nothing meanwhile. After 15 minutes
without `done`, `covenant pause` and tell the Captain.

**d. Read and record.** `javascript_tool`: `__covenant.reply()` → the Navigator's
markdown; `url` from the wait result. Write it verbatim to `<dir>/gpt-<n>.md`, then

```bash
covenant record --thread <dir> --author gpt --message-file <dir>/gpt-<n>.md --chat-url <url>
```

`closed-by-gpt` or `cap` → step 4. `flags.stalled` → the Watch is mandatory now.

**e. The Watch — after every Navigator reply.** `covenant watch-brief --thread <dir>`
prints the brief. Launch the `covenant-watch` agent with the Agent tool
(`subagent_type: "covenant-watch"`, the brief as the whole prompt; if that agent
type is not available, use `general-purpose` with model haiku and the brief, which
carries its own instructions). Record its JSON answer:

```bash
covenant record --thread <dir> --author watch --message '<the JSON>'
```

Then act on `next`: on-course → answer; nudge → answer and open with `Watch: …`;
pause → end your turn with a summary for the Captain (the thread stays paused until
the Captain runs `covenant resume`); close → write the close line with the verdict
if you agree, else `covenant pause` and ask the Captain.

**After every Navigator reply, print two lines for the Captain** (what the Navigator
said, what you will answer) so they can follow and step in. Never end your turn
mid-exchange without saying where the thread stands.

**Rules.** Verify every claim the Navigator makes about the code before accepting it;
accept with a concrete change of position, or reject with `path:line` evidence. Do
not converge by politeness; do not dig in without evidence.

## The Captain's hand

A message from the Captain is answered first by whoever speaks next, and it
overrides both of you.

- **In this room.** When the Captain interrupts and speaks: `covenant pause --reason
  captain`; answer them plainly (an explanation costs nothing, the thread waits).
  If they give an order for the Navigator: `covenant record --thread <dir> --author
  human --message "<their words>"`, then your next message opens with
  `From the Captain: …`. `covenant resume` continues; "stop" → `covenant stop`.
- **In the ChatGPT room.** The Captain may type to the Navigator directly in the
  tab. Before every send and after every interruption, `__covenant.resync()` and
  compare `userMessages.length` with `sent` from `covenant status`: extra user
  messages are the Captain's — record each with `--author human`, record the
  Navigator's answers with `--author gpt`, then continue from there.

**Resume** (after an interruption, a new session, or a pause): `covenant status` →
the thread, its `sent`, `gptTurns`, `chat`; `navigate` to `chat`; install the helper;
`__covenant.resync()`; record anything the ledger lacks; `covenant resume` if paused
and the Captain said so; continue at the right step.

## When the Navigator asks for a file or a report

Write it yourself as a markdown file (an analysis, the quoted lines with
`path:line`, a listing), then `covenant attach --thread <dir> --file <path> [--as
<name>] [--note "<one line>"]`. Paste it into the composer like any message: a long
paste becomes an attachment chip above an empty composer, so skip the length check
and confirm the chip instead (a button "Remove pasted text attachment" exists). Type
`Attached: <name>`, Return, wait, read, record the reply as usual; record your side
as `--message "attached <name>: <one line>"`. Knowledge every future thread needs
goes into the project's Sources via `docs/covenant/pack.json` and `covenant pack`
instead. If a step is refused, stop and tell the Captain what was refused.

## 4. Close

End your message with `COVENANT CLOSE: <one-line verdict>` when the goal is met; the
Navigator may close the same way; the Watch may say the goal is met. Once `record`
reports the thread closed (ledger line, commit on the current branch, push), give the
Captain a short summary: the outcome, the Navigator's last stance, what stayed in
dispute, and the transcript path `<dir>/transcript.md`.

## Build mode (`--mode build`)

A build thread ends in agreed, verified changes, not a verdict. It runs on the codex
lane by default so the Navigator can open the files and run the tests itself. Phases:

1. **Requirements.** `covenant open --mode build --title … --goal … --question "<what
   must be true when it ships>"`, then `outgoing --clip` (the first send asks the
   Navigator for its numbered requirements), wait, record, Watch.
2. **Plan.** Write `<dir>/plan.md` in this shape and propose it:
   ```
   # Plan: <title>
   ## Requirements
   - R1: <text>
   ## Steps
   ### 1. <title>
   files: <paths>
   tests: <command or spec names>
   done when: <observable outcome>
   ```
   `covenant plan propose --thread <dir> --file <dir>/plan.md`, then
   `covenant outgoing --thread <dir> --plan --clip`, send, wait, record, Watch. The
   Navigator's reply ends with a ```verdict block; `record` parses it. Objections →
   edit the plan and propose again (a new version). `agree` → ask the Captain to sign:
   `covenant plan sign --thread <dir>`. Nothing executes before that.
3. **Execute, one step at a time.** `covenant step start --thread <dir>`; do the work
   on the branch, run the step's tests, save the outputs to files (the diff, the test
   output); `covenant step done --thread <dir> --evidence <f1,f2> --note "<claim>"`;
   `covenant outgoing --thread <dir> --step --clip`, send, wait, record, Watch. `agree`
   → next step. Objections → fix, `step done` again (twice at most, then the thread
   pauses for the Captain).
4. **Done.** When every step is agreed the phase is `done`: close with the verdict line
   and give the Captain the summary: requirements, plan version, steps and evidence.

In the codex lane each exchange is `covenant turn --thread <dir> --message-file <f>`
with the text from `outgoing --plan` / `outgoing --step` saved to a file.

## Codex lane (`--lane codex`)

Same thread, no browser: `covenant open … --adapter codex`, then per exchange
`covenant turn --thread <dir> --message-file <file>` (Bash, timeout 900000) returns
the Navigator's reply framed; it reads the repo itself. With the Stop hook installed,
`open … --session "$CLAUDE_CODE_SESSION_ID"` makes the relay automatic.

## Never

Relay secrets or env values · open a second tab or window · run two threads at once ·
continue after the Captain says stop · paste the Navigator's words as your own
without checking · skip the Watch · send anything to ChatGPT that is not a Covenant
message.
