# Contributing

`main` is protected: changes land through a pull request with a linear history.
`npm test` must pass; it runs the bookkeeping end to end in a throwaway repo with no
browser, model or network, on Node 22 and 24.

## Reporting a voyage that went wrong

Open an issue with the "Voyage report" template. Attach, with anything private
removed: the council's `transcript.md`, the output of `covenant doctor`, the page
helper version (`__covenant.v` in the tab), which lane, and what Gandalf
expected to happen. A refusal by Claude Code's safety layer is a report too: say
which step, and whether the session was in auto mode.

## Proposing a change

Small and obvious: open the pull request. Anything that changes the protocol (the
brief, the gates, Háma rubric, the persona template) starts as an issue with the
reasoning, because every repo that wired the Covenant inherits it on its next
`covenant-setup`.

## Code

Node, ES modules, no build step, one dependency (Playwright, used only by the browser
lane). Keep the CLI's commands documented in the header of `bin/covenant.mjs`; keep
the skills in plain, imperative English; never put a person's path, name or account
into the repo.
