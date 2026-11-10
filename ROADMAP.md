# Roadmap

Status on 2026-11-10: Prove-it items 4–5 and the whole of Trust are built (license,
`npm test`, CI on Node 22/24 × Ubuntu/Windows, changelog, contributing, issue
template, social preview image, badges). In Depth, `build` mode, pacing, the Slack
mirror and the API lane are built; `build` mode is covered by `npm test`, the other
three await a live run. Open: the install on a real repo and the first voyage (the
Gandalf's hand), npm publish, the awesome-list pull request, the announcement, the
history import.

What makes the Covenant trustworthy first, then findable, then deeper. Each item
says what done looks like. Phases are ordered by dependency: nothing in Reach ships
before Trust is done, because every visitor a listing brings lands on the README
and the first `covenant-setup`.

## 0 · Prove it

| Item | Done when | Owner |
| --- | --- | --- |
| Install on a real repo through `/covenant-setup` | `covenant doctor` all green on a wired repo; the commit of the wiring sits on a feature branch | Gandalf runs the one line; the skill does the rest |
| First full voyage, extension lane | one live question goes goal → blind take → position → Háma → close; the transcript and the ledger line are committed | Théoden |
| Fix what the voyage breaks | every surprise from the page, the skill or Háma is a commit, not a note | Théoden |
| LICENSE | `LICENSE` (MIT) at the root; GitHub shows the license badge | Gandalf's call, one file |
| `npm test` | the bookkeeping run (init, pack, doctor, open, blind sends, the brake, pause/resume, Gandalf's record, close, commit) as `tests/smoke.mjs` in a throwaway git repo, green on Node 22 and 24 | Théoden |

## 1 · Trust (v0.1.0)

| Item | Done when | Owner |
| --- | --- | --- |
| CI | a GitHub Actions workflow runs `npm test` on push and pull request; the badge is in the README | Théoden |
| CHANGELOG | `CHANGELOG.md` with a `0.1.0` entry: what works, what is untested, the lanes and the terms note | Théoden |
| Release | git tag `v0.1.0` and a GitHub release with the changelog entry | Gandalf approves, Théoden tags |
| CONTRIBUTING + issue template | how to report a voyage that went wrong (transcript, doctor output, page helper version), how to propose a change (pull request to `main`, which is protected) | Théoden |
| Social preview | the frigate rendered to a 1280×640 PNG; uploaded in the repo settings (web UI only) | Théoden renders, Gandalf uploads |
| README truth pass | the Status section matches the voyage log; nothing promised that has not run | Théoden |

## 2 · Reach

| Item | Done when | Owner |
| --- | --- | --- |
| npm | `the-covenant` published (the name is free); install reads `npm i -g the-covenant` then `covenant-setup`; the README and the launcher use it | Gandalf's npm account; Théoden prepares |
| awesome lists | a pull request to `hesreallyhim/awesome-claude-code` following its contribution rules, then the smaller lists; one line and the link | Gandalf's call; Théoden drafts |
| A voyage people can read | one real, sanitized transcript under `docs/examples/`, linked from the README; a 60-second recording of a council running | Théoden |
| Announcement | a short post where Claude Code users are (the Claude subreddit, Show HN, X), written in the README's voice; stars and topic-page rank watched for a week | Gandalf writes or approves |

## 3 · Depth

| Item | Done when | Owner |
| --- | --- | --- |
| `build` mode | goal → agreed requirements → an agreed plan → each step executed by Théoden and reviewed by Gríma with evidence, structured verdicts, bounded retries, Gandalf signing the plan before execution; Gríma reads the repo through the codex lane | Théoden, after a ruling on the step schema |
| Pacing in the extension lane | a minimum gap between sends and a daily cap enforced in `outgoing`, like the browser daemon already does | Théoden |
| Háma enforcement hook | a hook that refuses the next send until Háma has recorded a verdict, so the skill cannot be skipped | Théoden |
| Slack mirror | optional, driven by `.covenant.json → slack.cli`: a channel per council, personas, Gandalf's replies pulled before each send, archived at close | Théoden |
| API lane | Gríma through the OpenAI API with the pack in a File Search store, for unattended councils | Théoden |
| History import | `tools/distil-export.mjs` → `docs/covenant/history.md` from a ChatGPT data export | Gandalf exports, Théoden distils |

## 4 · Crew

| Item | Done when | Owner |
| --- | --- | --- |
| Teammates aboard | a teammate clones a wired repo, runs `/covenant-setup`, gets their own ChatGPT project, and runs a voyage without help | Gandalf invites; the skill does the rest |
| Codex-first teammates | the codex lane documented as the path for people who do not use Claude in Chrome | Théoden |

## Risks the plan carries

- **Claude Code's safety layer in auto mode.** Allow rules take Bash and Edit out of its hands by its own account; for the browser tools that is not yet proven. If the first voyage still hits refusals, the council runs in manual mode and the README says so.
- **chatgpt.com changes its markup.** The page helper is versioned and the skill stops and says so when the composer is not found; a fix is a small commit.
- **OpenAI's terms.** The extension and browser lanes are automated access to chatgpt.com, which the terms do not allow; the account owner carries that. The codex lane is inside the rules and is the recommended lane for `build` councils.
- **Háma's judgment.** Every verdict is in the transcript; a week of voyages tells whether it pauses too much or too little, and the rubric is one file.

## How we will know it is working

Stars and forks on the repo; the repo's rank on the `ai-code-review` and
`pair-programming` topic pages; npm weekly downloads once published; and the number
of voyages in `docs/covenant/ledger.md` across the repos that use it.
