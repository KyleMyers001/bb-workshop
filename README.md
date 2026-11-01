# BB Workshop

Personal BB customizations in one permanent source checkout. This is a public
source repository, **not** a backup of BB's private configuration or runtime.

## Contents

- `plugins/agent-activity`: compact live sidebar activity counts and thread popovers.
- `plugins/archived-threads`: read-only archived conversation navigation.
- `plugins/delivery-dashboard`: GitHub activity and contributor comparisons.
- `plugins/kanban`: project Kanban boards with agent-managed thread cards.
- `plugins/needs-you`: agent attention inbox with specific asks, snooze, and handled history.
- `plugins/security-dashboard`: team Dependabot inbox with an explicit repository watch list.
- `plugins/skill-highlighting`: paint-only slash-skill syntax highlighting.
- `plugins/thinking-signal`: theme-colored sidebar working indicator.
- `plugins/workbench-reader`: read-only Markdown library, local full-text search,
  and focused reading for Workbench documents.
- `plugins/workflows`: independently maintained Workflows copy with plugin ID
  `workshop-workflows`, familiar commands/tools, and vendored public-SDK UI.
- `themes/midnight-observatory` and `themes/tokyo-night-storm`: standalone
  themes, independent of plugins.
- `themes/midnight-studio`: opt-in Observatory variant with conversation-only
  reading typography; the native composer and its fades stay unchanged.
- `.bb/plugins.json`: BB's ten-plugin collection index.

The original plugin IDs, engine ranges, and SDK **0.6.104** pins are retained,
except the Workflows fork uses `workshop-workflows` because BB reserves the
builtin `workflows` ID.
There is no shared runtime library. Each plugin owns its manifest and tests;
all npm dependencies resolve through one root lockfile.

## Setup and verification

Requires Node 24+, npm with workspace support, and BB with SDK 0.6.104.
`bb` must be on PATH; SDK checks/builds use that installed BB. The delivery
dashboard also needs an existing `gh` login on the BB server machine, or its
optional secret setting. The security dashboard uses the server's existing
`gh` login with per-repository Dependabot permissions. Do not put credentials
in this repository. The stable default branch is `main`; make changes on
feature branches and submit them through pull requests.

```sh
git clone git@github.com:KyleMyers001/bb-workshop.git ~/Development/bb-workshop
cd ~/Development/bb-workshop
npm ci --include=dev
npm run verify
```

`verify` runs script tests, every plugin's tests, root/plugin typechecks,
every plugin's SDK-pin check, and all ten builds. Individual aggregates are
`npm test`, `npm run typecheck`, `npm run sdk:check`, and `npm run build`.
To work on one package, for example:

```sh
npm test --workspace plugins/archived-threads
npm run typecheck --workspace plugins/archived-threads
npm run sdk:check --workspace plugins/archived-threads
npm run build --workspace plugins/archived-threads
```

You can also run those package scripts from its directory after the root
`npm ci`. Do not generate per-plugin lockfiles or update SDK pins incidentally.

## Explicit local installation

Keep the checkout at `~/Development/bb-workshop`, **outside BB-managed
workspaces**. Archiving a thread must never own installed source. BB loads
path plugins in place; moving/deleting their source breaks them.

```sh
npm run install:local -- --dry-run
npm run install:local -- --apply
```

There is deliberately no npm lifecycle `install` hook. Dry-run only reads
source and asks `bb theme dir --json` where themes belong. Apply runs the full
verification again **before** reinstalling the same IDs from:

```text
~/Development/bb-workshop/plugins/agent-activity
~/Development/bb-workshop/plugins/archived-threads
~/Development/bb-workshop/plugins/delivery-dashboard
~/Development/bb-workshop/plugins/kanban
~/Development/bb-workshop/plugins/needs-you
~/Development/bb-workshop/plugins/security-dashboard
~/Development/bb-workshop/plugins/skill-highlighting
~/Development/bb-workshop/plugins/thinking-signal
~/Development/bb-workshop/plugins/workbench-reader
~/Development/bb-workshop/plugins/workflows
```

The script never calls `plugin remove`, writes plugin settings, selects a
theme, or changes code themes. Initial Workflows cutover is a separate explicit
step: verify first, check that no builtin workflows are active across projects,
then disable (never remove) builtin `workflows`, install `workshop-workflows`,
and explicitly copy its six public settings. Builtin history is not migrated.
Only one copy may be enabled. The installer refuses to apply while the builtin
is enabled; see [Workflows cutover and rollback](plugins/workflows/README.md).
Existing path-plugin settings are compared
before/after without printing their values; managed or disabled replacements
are refused. Theme files are copied to `bb theme dir`, identical files are
left alone, and differing files or symlinks cause a preflight failure—no
silent overwrites or deletions. Resolve conflicts explicitly after preserving
your local edits. Unrelated theme files are never pruned.

The initial appearance is Midnight Observatory with Tokyo Night / GitHub Light
code themes. Installation preserves whatever appearance is already selected;
it does not activate either supplied theme. Activation is a separate choice
with `bb theme set <id>`.

Installation is sequential, not a multi-plugin transaction. If a step fails,
stop and inspect `bb plugin list`; already moved paths remain usable. Fix the
failure and rerun. Never remove an ID to retry. After installation, check the
dashboard, Archived navigation, composer highlighting, a working row, and a
new Workflows run card/inspector in an open BB window; reload that window if
needed.

## Updates

Use feature branches and PRs; do not commit/push to `main` or `master`, rewrite
private source histories, or merge without explicit approval. Pull approved
changes without discarding local edits, run `npm ci --include=dev`, preview
installation, then apply. Path installs do not automatically follow GitHub
releases. For a single verified plugin change, build it and run
`bb plugin reload <id>`.

## Source snapshots and recovery

The public repository begins with a cleaned source snapshot. Original plugin
histories remain unchanged in private local checkouts and verified bundles;
they are intentionally not GitHub ancestors. Do not push private history
branches, `--all`, or `--mirror` to this public remote.

After committing on a feature branch:

```sh
npm run backup
# Optional different destination, outside the checkout:
npm run backup -- "$HOME/Backups/bb-workshop"
```

This creates and verifies a uniquely named full Git bundle under
`~/Backups/bb-workshop/`. It requires a clean, attached checkout. Bundles contain
committed history/refs, not uncommitted or ignored files, dependencies, builds,
settings, databases, credentials, or raw recovery evidence. These are manual
**local snapshots**, not scheduled or off-machine backups. A GitHub push stores
only the pushed committed source off-machine; it is not a BB configuration
backup or an independent backup policy. See [recovery](docs/recovery.md) for
restore verification and rollback. Keep original checkouts and existing
bundles until separately authorized to retire them.
