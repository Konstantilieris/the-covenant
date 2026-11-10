---
name: covenant
description: Open a Covenant council — a recorded dialogue between this Claude Code session (Théoden) and the owner's ChatGPT (Gríma), driven through the Claude in Chrome extension with no copy-paste by the owner (Gandalf), watched by the covenant-watch agent, recorded in this repo under docs/covenant/. Use when the user says "/covenant", "ask GPT", "covenant on this", "get ChatGPT's opinion", "run this by ChatGPT".
disable-model-invocation: true
---

# /covenant — Théoden and Gríma talk it through; Gandalf decides

`$ARGUMENTS`: `<question | file path | <ISSUE-KEY>> [--cap N] [--context p1,p2] [--no-blind] [--lane extension|codex]`

Roles: **Gandalf** is the owner; **Gríma** is their ChatGPT, in this
project's ChatGPT project; **Théoden** is you. The council runs until one side
writes `COVENANT CLOSE: <verdict>`, the cap (default 8 Gríma turns) is reached,
Háma or Gandalf stops it. Everything is recorded under this repo's
`docs/covenant/councils/<date>-<slug>/` and committed on the current branch at close.

CLI: `node {{ROOT}}/bin/covenant.mjs <cmd>` — written `covenant` below. Run it as the
**first token of the Bash command** (no `cd … &&` in front: the session's working
directory is the repo, and the allow rule matches the command's start); pass
`--cwd "$PWD"` if ever in doubt. Browser: the `mcp__claude-in-chrome__*` tools (load
them with ToolSearch first; use `browser_batch` for sequences). **One tab only**: the
extension's own tab in Gandalf's Chrome; never open extra windows or tabs.

## 0. Preflight

- `covenant doctor` → every check ✓ (the project URL set, the pack built, not on
  main, at most one open council). Fix what it names or tell Gandalf.
- `covenant status` → if `openThreads` lists a council of yours, continue it (see
  Resume) instead of opening another.
- `tabs_context_mcp` → if the group has no tab, `navigate` (without tabId) creates
  the one tab. If ChatGPT is not logged in there, stop and say so.
- `--lane codex`: no browser; see "Codex lane" at the end.

## 1. The goal, the question, the context

- File path → read it. `<ISSUE-KEY>` → fetch the issue. Free text → as is.
- **The goal comes from Gandalf, never from an assumption.** If the request states a
  goal (a "Goal:" line, or a clear "done when"), use it verbatim. If it does not, do
  not guess: look at the question and the files you picked, write two or three
  candidate goals in the two-sentence shape (the decision this council must reach,
  and what counts as done; for example: "Decide where the quiet-hours shift lives.
  Done when we have one answer, the file it goes in, and the one reason it is not
  the other place."), put the one you recommend first, and ask Gandalf which one,
  in plain words, before anything else happens. Wait for the answer. Only then
  `covenant open`. No goal, no council.
- Pick the 2–6 files that matter (`--context`). Gríma cannot read the repo:
  quote the decisive lines with `path:line` in your messages. The project already
  holds the context pack; do not paste it.

## 2. Open

```bash
covenant open --title "<≤ 60 chars>" --goal "<two sentences>" --question-file <file> --context <p1,p2> --cap <N>
covenant context --council <dir> --clip     # the goal context: pack sections + the named files, ≤ 12 KB
```

`open` prints the council dir `<dir>` and `projectUrl`. `context` puts a goal-specific
attachment on the clipboard: paste it into the composer **before** the first message's
text (it becomes an attachment chip), then the text. Message files live in `<dir>`:
`claude-<n>.md`, `gpt-<n>.md`.

## 3. The exchanges

**Blind first take (default).** Write your position to `<dir>/claude-1.md` and
record it first (the timestamp proves it predates Gríma's take). Then send
the question alone, record Gríma's take, then send your position:

1. `covenant record --council <dir> --author claude --message-file <dir>/claude-1.md`
2. `covenant outgoing --council <dir> --clip` (no message file → brief + question only)
   → send (b) with the goal context chip first, wait (c), read and record (d), Háma (e).
3. `covenant outgoing --council <dir> --message-file <dir>/claude-1.md --clip` → send,
   wait, record, Háma. Do **not** record claude-1 again. From here on, (a)–(e).

`--no-blind` sends brief + position together.

**a. Your message.** Write it to `<dir>/claude-<n>.md`: position, evidence (quoted
lines with paths), the questions for Gríma. Under ~500 words. If Háma
said `nudge`, open with `Háma: <its nudge>`. If Gandalf spoke, open with
`From Gandalf: <their words>` and answer it before anything else. Then:

```bash
covenant record --council <dir> --author claude --message-file <dir>/claude-<n>.md
covenant outgoing --council <dir> --message-file <dir>/claude-<n>.md --clip
```

`record` returns `kind`; `closed-by-claude` → step 4. `outgoing` refuses while the
council is paused or Háma has not reviewed the latest reply; otherwise it puts
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
   `outgoing`; if not, repeat 2–3 once, then stop and tell Gandalf.
5. `computer` key `Return`, wait 10.

**c. Wait.** `javascript_tool`: `await __covenant.wait(20000)` — repeat that one call
until `done: true`. Thinking takes minutes; send nothing meanwhile. After 15 minutes
without `done`, `covenant pause` and tell Gandalf.

**d. Read and record.** `javascript_tool`: `__covenant.reply()` → Gríma's
markdown; `url` from the wait result. Write it verbatim to `<dir>/gpt-<n>.md`, then

```bash
covenant record --council <dir> --author gpt --message-file <dir>/gpt-<n>.md --chat-url <url>
```

`closed-by-gpt` or `cap` → step 4. `flags.stalled` → Háma is mandatory now.

**e. Háma — after every Gríma reply.** `covenant watch-brief --council <dir>`
prints the brief. Launch the `covenant-watch` agent with the Agent tool
(`subagent_type: "covenant-watch"`, the brief as the whole prompt; if that agent
type is not available, use `general-purpose` with model haiku and the brief, which
carries its own instructions). Record its JSON answer:

```bash
covenant record --council <dir> --author watch --message '<the JSON>'
```

Then act on `next`: on-course → answer; nudge → answer and open with `Háma: …`;
pause → end your turn with a summary for Gandalf (the council stays paused until
Gandalf runs `covenant resume`); close → write the close line with the verdict
if you agree, else `covenant pause` and ask Gandalf.

**After every Gríma reply, print two lines for Gandalf** (what Gríma
said, what you will answer) so they can follow and step in. Never end your turn
mid-exchange without saying where the council stands.

**Rules.** Verify every claim Gríma makes about the code before accepting it;
accept with a concrete change of position, or reject with `path:line` evidence. Do
not converge by politeness; do not dig in without evidence.

## Gandalf's hand

A message from Gandalf is answered first by whoever speaks next, and it
overrides both of you.

- **In this room.** When Gandalf interrupts and speaks: `covenant pause --reason
  captain`; answer them plainly (an explanation costs nothing, the council waits).
  If they give an order for Gríma: `covenant record --council <dir> --author
  human --message "<their words>"`, then your next message opens with
  `From Gandalf: …`. `covenant resume` continues; "stop" → `covenant stop`.
- **In the ChatGPT room.** Gandalf may type to Gríma directly in the
  tab. Before every send and after every interruption, `__covenant.resync()` and
  compare `userMessages.length` with `sent` from `covenant status`: extra user
  messages are Gandalf's — record each with `--author human`, record the
  Gríma's answers with `--author gpt`, then continue from there.

**Resume** (after an interruption, a new session, or a pause): `covenant status` →
the council, its `sent`, `gptTurns`, `chat`; `navigate` to `chat`; install the helper;
`__covenant.resync()`; record anything the ledger lacks; `covenant resume` if paused
and Gandalf said so; continue at the right step.

## When Gríma asks for a file or a report

Write it yourself as a markdown file (an analysis, the quoted lines with
`path:line`, a listing), then `covenant attach --council <dir> --file <path> [--as
<name>] [--note "<one line>"]`. Paste it into the composer like any message: a long
paste becomes an attachment chip above an empty composer, so skip the length check
and confirm the chip instead (a button "Remove pasted text attachment" exists). Type
`Attached: <name>`, Return, wait, read, record the reply as usual; record your side
as `--message "attached <name>: <one line>"`. Knowledge every future council needs
goes into the project's Sources via `docs/covenant/pack.json` and `covenant pack`
instead. If a step is refused, stop and tell Gandalf what was refused.

## 4. Close

End your message with `COVENANT CLOSE: <one-line verdict>` when the goal is met; the
Gríma may close the same way; Háma may say the goal is met. Once `record`
reports the council closed (ledger line, commit on the current branch, push), give the
Gandalf a short summary: the outcome, Gríma's last stance, what stayed in
dispute, and the transcript path `<dir>/transcript.md`.

## Build mode (`--mode build`)

A build council ends in agreed, verified changes, not a verdict. It runs on the codex
lane by default so Gríma can open the files and run the tests itself. Phases:

1. **Requirements.** `covenant open --mode build --title … --goal … --question "<what
   must be true when it ships>"`, then `outgoing --clip` (the first send asks the
   Gríma for its numbered requirements), wait, record, Háma.
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
   `covenant plan propose --council <dir> --file <dir>/plan.md`, then
   `covenant outgoing --council <dir> --plan --clip`, send, wait, record, Háma. The
   Gríma's reply ends with a ```verdict block; `record` parses it. Objections →
   edit the plan and propose again (a new version). `agree` → ask Gandalf to sign:
   `covenant plan sign --council <dir>`. Nothing executes before that.
3. **Execute, one step at a time.** `covenant step start --council <dir>`; do the work
   on the branch, run the step's tests, save the outputs to files (the diff, the test
   output); `covenant step done --council <dir> --evidence <f1,f2> --note "<claim>"`;
   `covenant outgoing --council <dir> --step --clip`, send, wait, record, Háma. `agree`
   → next step. Objections → fix, `step done` again (twice at most, then the council
   pauses for Gandalf).
4. **Done.** When every step is agreed the phase is `done`: close with the verdict line
   and give Gandalf the summary: requirements, plan version, steps and evidence.

In the codex lane each exchange is `covenant turn --council <dir> --message-file <f>`
with the text from `outgoing --plan` / `outgoing --step` saved to a file.

## Codex lane (`--lane codex`)

Same council, no browser: `covenant open … --adapter codex`, then per exchange
`covenant turn --council <dir> --message-file <file>` (Bash, timeout 900000) returns
Gríma's reply framed; it reads the repo itself. With the Stop hook installed,
`open … --session "$CLAUDE_CODE_SESSION_ID"` makes the relay automatic.

## Never

Relay secrets or env values · open a second tab or window · run two councils at once ·
continue after Gandalf says stop · paste Gríma's words as your own
without checking · skip Háma · send anything to ChatGPT that is not a Covenant
message.
