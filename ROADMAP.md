# Roadmap

Status on 2026-11-10: Prove-it items 4–5 and the whole of Trust are built (license,
`npm test`, CI on Node 22/24 × Ubuntu/Windows, changelog, contributing, issue
template, social preview image, badges). In Depth, `build` mode, pacing, the Slack
mirror and the API lane are built; `build` mode is covered by `npm test`, the other
three await a live run. Open: the install on a real repo and the first voyage (the
Captain's hand), npm publish, the awesome-list pull request, the announcement, the
history import.

What makes the Covenant trustworthy first, then findable, then deeper. Each item
says what done looks like. Phases are ordered by dependency: nothing in Reach ships
before Trust is done, because every visitor a listing brings lands on the README
and the first `covenant-setup`.

## 0 · Prove it

| Item | Done when | Owner |
| --- | --- | --- |
| Install on a real repo through `/covenant-setup` | `covenant doctor` all green on a wired repo; the commit of the wiring sits on a feature branch | Captain runs the one line; the skill does the rest |
| First full voyage, extension lane | one live question goes goal → blind take → position → Watch → close; the transcript and the ledger line are committed | Chief |
| Fix what the voyage breaks | every surprise from the page, the skill or the Watch is a commit, not a note | Chief |
| LICENSE | `LICENSE` (MIT) at the root; GitHub shows the license badge | Captain's call, one file |
| `npm test` | the bookkeeping run (init, pack, doctor, open, blind sends, the brake, pause/resume, the Captain's record, close, commit) as `tests/smoke.mjs` in a throwaway git repo, green on Node 22 and 24 | Chief |

## 1 · Trust (v0.1.0)

| Item | Done when | Owner |
| --- | --- | --- |
| CI | a GitHub Actions workflow runs `npm test` on push and pull request; the badge is in the README | Chief |
| CHANGELOG | `CHANGELOG.md` with a `0.1.0` entry: what works, what is untested, the lanes and the terms note | Chief |
| Release | git tag `v0.1.0` and a GitHub release with the changelog entry | Captain approves, Chief tags |
| CONTRIBUTING + issue template | how to report a voyage that went wrong (transcript, doctor output, page helper version), how to propose a change (pull request to `main`, which is protected) | Chief |
| Social preview | the frigate rendered to a 1280×640 PNG; uploaded in the repo settings (web UI only) | Chief renders, Captain uploads |
| README truth pass | the Status section matches the voyage log; nothing promised that has not run | Chief |

## 2 · Reach

| Item | Done when | Owner |
| --- | --- | --- |
| npm | `the-covenant` published (the name is free); install reads `npm i -g the-covenant` then `covenant-setup`; the README and the launcher use it | Captain's npm account; Chief prepares |
| awesome lists | a pull request to `hesreallyhim/awesome-claude-code` following its contribution rules, then the smaller lists; one line and the link | Captain's call; Chief drafts |
| A voyage people can read | one real, sanitized transcript under `docs/examples/`, linked from the README; a 60-second recording of a thread running | Chief |
| Announcement | a short post where Claude Code users are (the Claude subreddit, Show HN, X), written in the README's voice; stars and topic-page rank watched for a week | Captain writes or approves |

## 3 · Depth

| Item | Done when | Owner |
| --- | --- | --- |
| `build` mode | goal → agreed requirements → an agreed plan → each step executed by the Chief and reviewed by the Navigator with evidence, structured verdicts, bounded retries, the Captain signing the plan before execution; the Navigator reads the repo through the codex lane | Chief, after a ruling on the step schema |
| Pacing in the extension lane | a minimum gap between sends and a daily cap enforced in `outgoing`, like the browser daemon already does | Chief |
| Watch enforcement hook | a hook that refuses the next send until the Watch has recorded a verdict, so the skill cannot be skipped | Chief |
| Slack mirror | optional, driven by `.covenant.json → slack.cli`: a channel per thread, personas, the Captain's replies pulled before each send, archived at close | Chief |
| API lane | the Navigator through the OpenAI API with the pack in a File Search store, for unattended threads | Chief |
| History import | `tools/distil-export.mjs` → `docs/covenant/history.md` from a ChatGPT data export | Captain exports, Chief distils |

## 4 · Crew

| Item | Done when | Owner |
| --- | --- | --- |
| Teammates aboard | a teammate clones a wired repo, runs `/covenant-setup`, gets their own ChatGPT project, and runs a voyage without help | Captain invites; the skill does the rest |
| Codex-first teammates | the codex lane documented as the path for people who do not use Claude in Chrome | Chief |

## Risks the plan carries

- **Claude Code's safety layer in auto mode.** Allow rules take Bash and Edit out of its hands by its own account; for the browser tools that is not yet proven. If the first voyage still hits refusals, the thread runs in manual mode and the README says so.
- **chatgpt.com changes its markup.** The page helper is versioned and the skill stops and says so when the composer is not found; a fix is a small commit.
- **OpenAI's terms.** The extension and browser lanes are automated access to chatgpt.com, which the terms do not allow; the account owner carries that. The codex lane is inside the rules and is the recommended lane for `build` threads.
- **The Watch's judgment.** Every verdict is in the transcript; a week of voyages tells whether it pauses too much or too little, and the rubric is one file.

## How we will know it is working

Stars and forks on the repo; the repo's rank on the `ai-code-review` and
`pair-programming` topic pages; npm weekly downloads once published; and the number
of voyages in `docs/covenant/ledger.md` across the repos that use it.
