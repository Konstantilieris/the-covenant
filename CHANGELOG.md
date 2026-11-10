# Changelog

## 0.1.0 — 2026-11-10

First release. The log opens.

**Works, and is covered by `npm test`:** the council bookkeeping end to end — goal,
blind first take, Théoden's position recorded before Gríma's reply, stance
parsing, the brake (no send until Háma has reviewed the latest reply; a pause
refuses sends and Théoden messages until Gandalf resumes), Gandalf's record,
close by either side or the cap, the ledger line, the commit on the current branch.
The one-command install (`covenant-setup`): marker, data dir, launcher, skills, Háma
agent, allow rules, Stop hook, pack, doctor, commit.

**Works, exercised by hand on a live account:** the extension lane's page driver on
chatgpt.com (typing through the editor, sending, waiting for a reply to complete,
reading it back as markdown, pasting a long text as an attachment, adding project
sources by paste), the ChatGPT project creation and instructions, and the codex lane
end to end through the Stop hook.

**Built and covered by `npm test`, not yet run with a live model:** `build` mode
(requirements → plan with structured verdicts → Gandalf's signature → ordered
steps with kept evidence → done). **Built, unexercised:** the Slack mirror, the
`openai` lane, the browser (Playwright) lane. **Not yet run:** a full voyage on a live
question in the extension lane.

**Lanes and terms.** The extension and browser lanes are automated access to
chatgpt.com, which OpenAI's terms do not allow; the account owner carries that. The
codex lane is inside the rules.
