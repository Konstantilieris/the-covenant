# Changelog

## 0.1.0 — 2026-11-10

First release. The log opens.

**Works, and is covered by `npm test`:** the thread bookkeeping end to end — goal,
blind first take, the Chief's position recorded before the Navigator's reply, stance
parsing, the brake (no send until the Watch has reviewed the latest reply; a pause
refuses sends and Chief messages until the Captain resumes), the Captain's record,
close by either side or the cap, the ledger line, the commit on the current branch.
The one-command install (`covenant-setup`): marker, data dir, launcher, skills, Watch
agent, allow rules, Stop hook, pack, doctor, commit.

**Works, exercised by hand on a live account:** the extension lane's page driver on
chatgpt.com (typing through the editor, sending, waiting for a reply to complete,
reading it back as markdown, pasting a long text as an attachment, adding project
sources by paste), the ChatGPT project creation and instructions, and the codex lane
end to end through the Stop hook.

**Not yet run:** a full voyage on a live question in the extension lane; the browser
(Playwright) lane; the Slack mirror; the API lane; `build` mode.

**Lanes and terms.** The extension and browser lanes are automated access to
chatgpt.com, which OpenAI's terms do not allow; the account owner carries that. The
codex lane is inside the rules.
