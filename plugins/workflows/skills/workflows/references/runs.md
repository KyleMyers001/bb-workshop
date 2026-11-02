# Workflow run lifecycle

## Running and resuming

`bb_workflow_run` and `bb workflows validate` accept exactly one source mode:

- `script`: inline JavaScript.
- `scriptPath`: a relative path or an absolute path confined to the workflow
  origin environment's workspace.
- `name`: a lowercase kebab-case filename lookup name (at most 64 characters).
  Resolve `.bb/workflows/<name>.js` in the requesting workspace first; only
  structured missing-file absence permits fallback to `<name>.js` directly
  inside the optional shared directory. `meta.name` is display metadata, not
  the lookup key. CLI run/validate, the run tool, and nested `workflow(name)`
  use the same resolver.

The existing `source` field remains a supported alias for inline `script`, but
do not provide both. File and name resolution happens through the origin
environment's `hostId` and workspace root. Traversal, outside absolute/UNC
paths, missing workspace roots, non-UTF-8 files, and sources over 512 KiB are
rejected. QuickJS receives source text only; it never gets filesystem access.
Shared names use the shared directory as the read confinement root, still on
that same origin host. Local permission, transport, symlink-confinement,
encoding, size, or parse failures never select a shared substitute. Explicit
`--file`/`scriptPath` stays workspace-confined, even with sharing enabled.
Shared source selection never changes execution project, environment, inherited
provider/model/permissions, or orchestration authorization.

`bb_workflow_run` also accepts optional JSON `args` and optional `resumeRunId`.
It returns a durable run ID immediately. Use the compact `bb workflows status`
summary, paged `bb workflows history`, `bb workflows list`, and
`bb workflows stop` afterward. Completion is sent back as an agent-only input:
it steers an active origin immediately or starts a turn when the origin is idle,
without rendering a user-facing message. Delivery is duplicate-tolerant
at-least-once because `threads.send` has no idempotency key. CLI status polling
remains authoritative.

`list` returns compact **run history**, not saved workflows. Use the catalog
for workflow discovery; redirect detailed run history as described below.

## Discover saved workflows

`bb workflows catalog [--name <lookup-name>] [--limit 1-50]` and
`bb_workflow_catalog({ name?, limit? })` share one implementation. They parse
literal metadata without evaluating source, launching workers, or consulting
model providers. Author sessions receive the catalog tool; workers do not.

Each candidate includes `lookupName`, `path`, `scope` (local/shared), `selected`,
`shadowedBy`, parsed `metadata` (including description and `inputSchema`), and a
`diagnostic`. Both copies appear when a local override shadows shared, even if
that override is broken. Read the source using host-appropriate file tools;
validate the selected name before running. Discovery is not execution approval.

Only top-level kebab-case `.js` file candidates are inspected. Directory entries
are bounded to 1000 per root, then at most 100 sorted lookup names are inspected.
Host directory browsing omits dangling symlinks; `--name` directly probes a known
candidate. The default entry limit is 20 (maximum 50), serialized metadata is
limited to 8 KiB per candidate, and total output to 64 KiB. Inspect
`scanIncomplete`, `outputTruncated`, `omittedEntries`, `metadataOmitted`, and
`diagnostics`: an incomplete/omitted listing is not proof that a workflow is
absent. Query a specific name to avoid listing limits. Missing or inaccessible
shared roots and host failures are reported, not treated as an empty library.

Detailed history can contain every prompt, critique, result, and call record,
so never print it directly into the agent transcript. Materialize one bounded
JSONL page on the execution host, then use normal file-navigation tools:

```bash
run=<run-id>
mkdir -p "$BB_THREAD_STORAGE/workflows"
bb workflows history "$run" --cursor 0 --limit 100 \
  > "$BB_THREAD_STORAGE/workflows/$run.jsonl"
jq -c 'select(.type == "page")' "$BB_THREAD_STORAGE/workflows/$run.jsonl"
```

The last `page` record supplies `nextCursor`; fetch that cursor and append the
next page. Pages are snapshots, so rewrite from cursor `0` to refresh an active
run. Redirection is performed by your shell, which places the file in the
correct local or remote thread storage without giving the plugin arbitrary
host filesystem access.

To resume after a pause, stop, restart, or script edit, relaunch with the same
current source and `resumeRunId`. Resume requires a terminal prior run in the
same project and environment workspace and always creates a new run. The
longest unchanged prefix of successful `agent()` calls returns cached results;
the first edited or new call and everything after it runs live. The cache key
includes call order, prompt, resolved provider/model/reasoning/permission,
output schema, and worker protocol semantics. Display-only phase, label, and
title changes do not invalidate it.

Parallel calls receive cache identities in deterministic invocation order, so
concurrency alone does not stop replay. Successful calls that edited files or
performed other writes are cached too: resume is restricted to the same
environment workspace, where their side effects remain. Failed, cancelled,
incomplete, and null-result calls are not reusable; the first such call and the
entire suffix run live. Legacy runs without replay-safety metadata replay
nothing. A plugin restart applies the same longest-prefix rule.

Each `agent()` call retries transient provider failures twice with bounded
backoff before surfacing the error to `parallel()`/`pipeline()` or the script.
Overload, rate-limit, provider 5xx, and recognized network failures retry;
authentication, configuration, and schema failures do not. The retry count is
persisted and visible in workflow history.

The CLI equivalents are:

```bash
bb workflows catalog
bb workflows catalog --name review-change
bb workflows validate --script '<javascript>'
bb workflows validate --file .bb/workflows/review-change.js
bb workflows validate --name review-change
bb workflows run --script '<javascript>' --args '<json>'
bb workflows run --file .bb/workflows/review-change.js --resume <run-id>
bb workflows run --name review-change
bb workflows status <run-id>
bb workflows history <run-id> --cursor 0 --limit 100
bb workflows list --limit 20
bb workflows stop <run-id>
bb provider list --environment "$BB_ENVIRONMENT_ID" --json
bb provider models <provider-id> --environment "$BB_ENVIRONMENT_ID" --json
```

The CLI's `--file` maps to the agent tool's `scriptPath`, but a relative CLI
path starts at the invoking CLI's current directory. Both that directory and
the resolved file must remain inside the origin workspace. `--source` remains
an inline alias for `--script`. Run and validate require exactly one of
`--script`, `--file`, or `--name` (counting `--source` as `--script`).

`bb workflows --help` and `bb workflows <command> --help` print the arguments,
option limits, and rules for a command and exit 0. Command output is JSON;
adding `--json` also reports a failure as `{"ok":false,"error":{…}}` on stdout,
alongside the readable message on stderr.

Workflow worker threads use hidden visibility and are plugin-attributed. They
stay out of sidebar organization without contributing unread/pending favicon
attention. Ordinary search, prompt history,
lifecycle, and direct operations remain available. Workers are root threads,
so no parent notification applies; a hidden thread that does have a parent
still reports its turns and blockers to it. Workflows does not create a
temporary Workflow folder.

## Settings

Change settings with `bb plugin config workshop-workflows set <key> <value>`;
no plugin reload is needed.

`sharedWorkflowDirectory` is an optional plugin-global string, **unset by
 default**. Set an absolute directory through Settings → Installed plugins or:

```sh
bb plugin config workshop-workflows set sharedWorkflowDirectory /absolute/library
```

Clear it by saving an empty string (or unsetting it). Relative paths, `~`, and
environment-variable expressions are rejected; the plugin never expands them
or creates directories. The path is interpreted on the **requesting environment's
host**, not the server; on another host the same path must exist there. There is
no per-host mapping or cross-host copying. Setting updates affect subsequent
source loads, including later nested loads, not captured source or historical
six-field numeric run snapshots. Shared access is opt-in source selection,
not sandboxing or permission to run agents.

| Key                    | Default  | Range           |
| ---------------------- | -------- | --------------- |
| `maxActiveRuns`        | 4        | 1–32            |
| `maxConcurrentAgents`  | 8        | 1–64            |
| `maxAgentCalls`        | 100      | 1–1000          |
| `totalRunTimeoutMs`    | 86400000 | 60000–604800000 |
| `retentionDays`        | 7        | 1–3650          |
| `maxNotificationBytes` | 16384    | 1024–262144     |

`maxActiveRuns` is live plugin-global dispatch policy. Shared parent/child agent
concurrency and call count, total run timeout, retention, and UTF-8
completion-message size are snapshotted per run. `status` is bounded
to compact progress and call counts. Paged JSONL `history` carries ordered
call-level execution, cache, child-thread, repair, result, and error details.

Workers are hidden and owned by the workflow plugin across every retry attempt.
Finished, replaced, cancelled, and unattached workers are stopped and archived
by maintenance without waiting for history retention. Cleanup retries across
restarts and survives history expiry. Archiving or deleting an origin cancels
its outstanding workflows and retires its owned workers while preserving
retained history. Completion notification becomes `abandoned` for an archived
or deleted origin; unrelated send conflicts and transient failures retry.
Upgrades recover existing call references; older attempts already missing from
those references require a separate historical audit.
