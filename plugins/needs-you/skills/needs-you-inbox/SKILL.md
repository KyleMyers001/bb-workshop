---
name: needs-you-inbox
description: Report a specific question, permission request, blocker, or review handoff that needs Kyle in the Needs You inbox. Not for routine progress, idle status, or agent-to-agent waits.
---

# Needs You Inbox

Use `needs_you_raise` only when Kyle must decide or intervene. Keep the full
human-facing ask in chat too. Skip hidden or archived threads. Continue using
Kanban for workflow status; the inbox does not move its cards.

Supply a stable lowercase `key` for each distinct ask, `kind` (`question`,
`permission`, `blocker`, or `review`), short `title`, and the actual `ask`.
Add `context` explaining why Kyle is needed and a `recommendation` if useful.
Do not include credentials, raw logs, or private authentication material.

Reuse the same key when updating an ask. Identical reports preserve handled
and snoozed states; a material content change reopens the ask. Use a new key
for a genuinely different ask. Multiple requests may coexist in one thread.
Do not repeatedly reword an unchanged ask to defeat snooze or handling.

Use `needs_you_withdraw` with the key when an ask becomes obsolete. Agents
cannot mark requests handled using the native tools. Reading, snoozing,
handling, or withdrawing an item is **not approval**. Permission and replies
must come from Kyle in the original thread. Reported review readiness and
test results remain agent claims, not independent verification.

If native tools are unavailable, use the CLI in your thread:

```sh
bb needs-you raise refresh-scope --kind question \
  --title 'Choose refresh scope' --ask 'Panel-open refresh only?' \
  --context 'The refresh implementation is waiting on scope.' \
  --recommendation 'Keep background monitoring out of this version.'
bb needs-you withdraw refresh-scope
bb needs-you list --json
```

Outside a BB thread, raise/withdraw require `--thread <thread-id>`; the project
is inferred, or checked against `--project <project-id>`. List defaults to the
current project when available; use `--all` for all projects. Results page in
batches of 100 with `--offset 100`. A partial thread scan has lower-bound
counts; increase `--threads` in multiples of 200 (maximum 10000) or scope by
project. Do not claim all clear while coverage is partial or a read failed.

If reporting fails, retain the ask in chat and report the failure briefly.
Do not repeatedly create new keys or imply that an inbox item was delivered.
