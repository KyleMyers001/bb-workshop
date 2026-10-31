# Needs You

An attention inbox for specific agent questions, permission requests, blockers,
and review handoffs. Plugin ID `needs-you`; SDK **0.6.104**.

## Use

Open **Needs you** in BB navigation. All projects is the default; filter by
project, request type, search text, Snoozed, or History. Select an ask to read
its context, recommendation, and source, then **Open thread** to respond or
review. Source navigation opens the thread, not an exact message anchor.
Request lists have their own bounded scroll area so a large page does not
push the selected detail below hundreds of rows on narrow panels.

**Snooze 1h**, **Unsnooze**, **Mark handled**, and **Reopen request** affect only
the inbox. Snoozing does not unblock the agent. Handling is not approval,
verification, or thread completion. Grant permissions in the original thread.
There is no reply sender, merge/install action, credential form, notification
service, appearance change, or lifecycle installation hook.

The navigation badge counts open requests, not unread messages. A `?` means
unknown/unavailable; partial scans show a lower bound. All-clear requires a
successful, complete read. Disconnection, refresh failure, or data over 90
seconds old preserves last-known rows but disables status changes. Opening the
source thread remains available.

## Reporting asks

Agents receive `needs_you_raise`, `needs_you_withdraw`, and the bundled
`needs-you-inbox` skill at BB's next safe session configuration boundary.
Native tools target only their calling thread and check project and visibility.

Raise with a stable lowercase `key`, `kind` (`question`, `permission`,
`blocker`, `review`), `title` (160 characters), and actual `ask` (2000).
Optional `context` (2000) explains why Kyle is needed; `recommendation` (1000)
suggests a next step. Keep the full ask in chat too. Never include secrets or
raw authentication/error logs.

Identical repeats preserve snooze and handling, including reports through a
different channel (CLI/native tool). A changed ask reopens the same item with
a new version. Use a new key for a genuinely different ask, not to evade
snooze. Multiple asks can coexist in one thread. Withdraw obsolete asks; a
later explicit raise can reopen a withdrawn ask. Native tools do not mark
requests handled or grant permissions.

```sh
bb needs-you raise refresh-scope --kind question \
  --title 'Choose refresh scope' --ask 'Panel-open refresh only?' \
  --context 'Implementation is waiting on a scope decision.' \
  --recommendation 'Keep background monitoring out of this version.'
bb needs-you withdraw refresh-scope
bb needs-you list --json
bb needs-you list --all --filter review --offset 100 --json
```

Outside a thread, raise/withdraw need `--thread <id>`. Project is inferred or
checked against `--project <id>`. List defaults to the current project when
available, otherwise all projects; `--all` ignores thread context.

## Kanban integration and persistence

The inbox reads only Kanban's public thread-metadata namespace. Blocked and
Review cards produce labeled generic fallbacks; a Blocked card does not prove
Kyle is the blocker. Invalid/unrelated metadata is ignored. Metadata read
failure is not interpreted as an empty board. No Kanban fields are written.

A generic fallback is suppressed while an explicit open/snoozed ask in the
same class exists: review versus blocking (question, permission, blocker).
Handling that explicit ask also handles the current generic fallback of its
class. A subsequent board move/note/timestamp change creates a fresh fallback
revision. Leaving Blocked/Review withdraws the fallback. Independent review
and blocking asks remain separate.

Plugin-owned SQLite stores bounded request content, versions, snoozes, and
history across reloads and restarts. Mutations validate current thread
visibility and use expected versions; stale tabs cannot silently handle an
updated request. Hidden, archived, and deleted threads are excluded from all
views and badge counts. Merely reading a thread does not handle its asks.
No transcripts are scanned or copied; runtime idle/failure alone creates no
request. History is retained, not automatically pruned.

## Coverage and refresh limits

- Scan 2000 visible threads initially, in pages of 200; **Scan more threads**
  raises coverage to 10000. Beyond that choose a project. Counts explicitly
  remain lower bounds under partial coverage, including an empty result.
- Request lists page in batches of 100. Search and counts cover the scanned
  scope, not only the current request page. CLI `--threads` accepts multiples
  of 200 up to 10000; `--offset` pages requests, not threads.
- Up to 100 distinct reported keys per thread plus one generic board record;
  20000 total request records. New keys are refused at capacity, without
  deleting history. Updating an existing key remains supported.
- Lifecycle events invalidate reads. Mounted panel/badge hooks reconcile every
  30 seconds; snoozes return on the next read after their one-hour deadline.
  Kanban metadata changes need no new reporting tool and appear by the next
  reconciliation. Concurrent reads share a five-second directory cache.
- No separate always-on collector or notifications. The badge refreshes while
  mounted in BB navigation, even when the inbox panel is closed. With all
  clients closed, stored snoozes are evaluated on the next read.

Request content and metadata are ordinary application data, not authorization
boundaries or secret storage. Actor/source labels describe the reporting
path, not independent evidence or an identity guarantee.

## Development

From the workshop root:

```sh
npm ci --include=dev
npm test --workspace plugins/needs-you
npm run typecheck --workspace plugins/needs-you
npm run sdk:check --workspace plugins/needs-you
npm run build --workspace plugins/needs-you
npm run verify
npm run install:local -- --dry-run
```

Installation is separate and explicit. After verification, register this
permanent source path with `bb plugin install
path:$HOME/Development/bb-workshop/plugins/needs-you --yes`. Do not remove an
existing ID to update or roll back; reinstallation preserves plugin storage.
