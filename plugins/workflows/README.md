# Workshop Workflows

An editable, independently maintained copy of BB's Workflows plugin, installed
from this permanent checkout. No orchestration behavior has been redesigned.

- **Plugin ID:** `workshop-workflows` (`workflows` is reserved by BB).
- **Commands:** `bb workflows validate|run|status|history|list|stop`.
- **Tools:** `bb_workflow_run` for authors; `bb_workflow_result` for workers.
- **Skill:** `workflows`, with authoring and inspection references under `skills/`.
- **SDK:** pinned to 0.6.104; original engine ranges retained.

## Source and maintenance

The initial source/test snapshot comes from `get-bb/bb`, commit
`67df1208a63b38ce80872c8494075773ac8e2c3e`, `plugins/workflows/`.
Required shared UI source is vendored under `components/ui/` and `lib/` from
that same snapshot, with the registry's public-SDK icon wrapper. The original
MIT license and copyright are preserved in [LICENSE](LICENSE).

The implementation and upstream tests are retained. Packaging now uses public
SDK dependencies, package-local UI aliases, npm workspaces, and standard build
and verification scripts. Workshop-specific tests cover public dependency
boundaries and the new plugin identity. The fork does not track upstream
updates automatically: review and port desired changes explicitly.

## Verify and install

From the repository root:

```sh
npm ci --include=dev
npm run verify
npm run install:local -- --dry-run
```

For just this package:

```sh
npm test --workspace plugins/workflows
npm run typecheck --workspace plugins/workflows
npm run sdk:check --workspace plugins/workflows
npm run build --workspace plugins/workflows
```

Keep installed source at `~/Development/bb-workshop/plugins/workflows`, outside
BB-managed workspaces. Do not install from an ephemeral review checkout.

### First cutover from the builtin

This is a **new plugin identity**, not a same-ID source relocation. It gets its
own settings and database. Keep only one copy enabled: both register the same
CLI, native tools, skill, and message directive.

1. Verify the source and review the installer dry-run first.
2. Ensure no builtin workflows are queued or running **across all projects**.
   `bb workflows list` is project-scoped and bounded; one empty project list is
   not a global check. Let active work finish instead of interrupting it.
3. Read the builtin's six public settings locally with
   `bb plugin config workflows --json`; do not commit configuration exports.
   BB exposes the settings schema only while a plugin is running, so capture
   this baseline before disabling it and compare the fork while it is running.
4. Disable (never remove) the builtin, then install this copy:

   ```sh
   bb plugin disable workflows
   bb plugin install path:$HOME/Development/bb-workshop/plugins/workflows --yes
   ```

5. Explicitly copy the six effective setting values using
   `bb plugin config workshop-workflows set <key> <value>`, then compare the
   effective settings locally without printing sensitive configuration.
   Keys: `maxActiveRuns`, `maxConcurrentAgents`, `maxAgentCalls`,
   `totalRunTimeoutMs`, `retentionDays`, and `maxNotificationBytes`.
6. Confirm the fork and its `workflow-worker` service are running, the builtin
   is disabled, familiar CLI/tool registrations work, and a new run's live card
   and inspector render. Reload the BB window if needed.

The repository installer refuses to apply while builtin `workflows` is enabled.
It never disables plugins or copies builtin settings/history automatically.
After initial cutover, `npm run install:local -- --apply` treats this fork like
any other workshop path plugin, checking settings and appearance preservation.

### History and rollback

Builtin runs, resume cache, settings, and worker ownership remain with builtin
`workflows`; none are copied into the fork. Old run IDs cannot be resumed here,
and old inline cards cannot retrieve their builtin records while it is
disabled. New workshop runs belong only to the fork.

To return to the original, first let all workshop runs finish, then:

```sh
bb plugin disable workshop-workflows
bb plugin enable workflows
```

Reverse those enable/disable choices to return to the workshop copy, again
checking for active runs first. Neither switch removes source or data. Never
use `bb plugin remove`, edit BB's runtime database, or bypass reserved-ID checks.

## Behavior and constraints

Workflow JavaScript runs inside QuickJS without filesystem, shell, network,
imports, clock, or randomness. Worker threads retain normal tools and
permissions; starting them still requires explicit user authorization for
orchestration. Source comes from inline scripts or project-local files under
`.bb/workflows/`, resolved on the origin environment's host.

Run state, ordered calls, bounded retries, cancellation, retention, and resume
prefix caching persist in the plugin-owned database. The UI includes live run
cards, composer status, and the workflow inspector. Structured workers submit
schema-validated values through `bb_workflow_result`.

See [the workflows skill](skills/workflows/SKILL.md) for authoring, validation,
provider selection, settings, bounded CLI inspection, and operational limits.
