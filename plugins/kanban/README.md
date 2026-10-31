# BB Kanban

A live Kanban panel where every card is an existing BB thread. Open **Kanban**
in BB's navigation to see **All projects**, or select a single project, and
drag cards between **Backlog**,
**In progress**, **Blocked**, **Review**, and **Done**. Each card also has a
keyboard- and touch-accessible column selector. Select a title to open the
thread through BB's navigation. Use **New thread** to open BB's composer.

## Agents

The bundled `kanban-board` skill tells agents to update their card when work
starts, becomes blocked, is ready for review, or finishes. The native
`kanban_move` tool accepts a column and optional note of up to 280 characters;
it always targets the calling thread. Agents without native tool access use:

```bash
bb kanban move in-progress
bb kanban move blocked --note 'Waiting for a decision'
bb kanban move review --note 'Ready for review'
bb kanban move done
bb kanban list --json
```

Outside a BB thread, specify `--thread <id>` when moving a card. The project is
inferred from the selected thread. Specify `--project <id>` when listing.
`bb kanban list --offset 100` loads the next page. `--json` is available on both
commands; `--help` documents all flags. Agents with already-running sessions
receive the skill/tool at BB's next safe session configuration boundary.

## Behavior and persistence

- Visible, unarchived threads appear automatically, including child threads.
  Hidden workers and archived/deleted threads are excluded.
- Unsorted threads start in Backlog. Runtime activity is shown separately.
  Idle/failure events refresh the display; they do not infer completion.
- Moves atomically patch the thread's `kanban` plugin metadata. They survive
  panel closure, plugin reload, and BB restart. They never run, stop, message,
  archive, or delete a thread. Conflicting simultaneous moves use the last
  committed write. There is no manual ordering inside a column.
- Notes describe the latest move; omitting a note clears the previous note.
  Metadata is ordinary thread data, not secret storage or an access boundary.
- Boards update over realtime, refresh on reconnection, and reconcile every
  30 seconds. Title and metadata changes outside this plugin appear by the
  next reconciliation. Refresh is also available manually.
- **All projects** is the default selector option. Its cards show project names;
  moving a card updates that thread within its own project. **New thread**
  opens BB's composer without forcing a project; on a single-project board it
  preselects that project. The CLI keeps its project-scoped defaults.
- The board loads 100 threads initially across the selected scope. **Load more
  threads** loads another page; counts and search apply to loaded cards.
  Compact, flexible columns fit side by side on laptop-sized panels, with
  wrapping controls rather than horizontal scrolling. Panels with 760px or
  less of content width stack columns vertically, including when BB's sidebar
  or a split reduces the available space. Reopening resets to All projects.

## Workspace development and installation

Source lives permanently at `~/Development/bb-workshop/plugins/kanban`.
Dependencies use the workshop's npm workspaces and root lockfile. From the
workshop root:

```bash
npm ci --include=dev
npm run verify
npm run install:local -- --dry-run
```

For this plugin alone, use `npm test --workspace plugins/kanban`,
`npm run typecheck --workspace plugins/kanban`,
`npm run sdk:check --workspace plugins/kanban`, and
`npm run build --workspace plugins/kanban`.
After verification, explicitly repoint an existing installation with:

```bash
bb plugin install path:$HOME/Development/bb-workshop/plugins/kanban --yes
```

Reinstalling the same `kanban` ID preserves thread metadata and plugin settings.
Do not remove the plugin during migration. `npm run install:local -- --apply`
installs the full collection after verifying it. Neither npm installation nor
building automatically repoints BB.

The SDK, React, and other host-shimmed packages are development dependencies.
Zod is bundled into the backend. `components/`, `lib/`, and `hooks/` contain
BB's scaffolded vendored UI primitives; the board uses native form controls
styled with the live host theme. Keep this directory in place while installed.
