---
name: kanban-board
description: Keep your BB thread's Kanban card current as task work progresses. Use at the start of work, on blockers, when ready for review, and on completion.
---

# Thread Kanban

When doing task work in a visible, unarchived BB thread, keep its card current.
Use the native `kanban_move` tool with `column` and an optional `note` (up to
280 characters). It moves the calling thread only. If native tools are not
available, use the CLI:

```bash
bb kanban move in-progress
bb kanban move blocked --note 'Need a decision on the migration approach'
bb kanban move review --note 'Implementation and checks complete; awaiting review'
bb kanban move done --note 'Requested work is complete'
```

- `backlog`: work is deferred or has not started.
- `in-progress`: actively doing the task. Set this when starting or resuming work.
- `blocked`: unable to continue without input or an external change. Say what is needed.
- `review`: a concrete result is ready and awaits review or approval.
- `done`: the requested outcome is achieved and no required work remains.

Update on meaningful workflow changes, not every tool call. A paused runtime,
an idle turn, or writing a final answer does not by itself mean the task is done.
Omitting `note` clears the previous note. Do not put secrets in notes.
Do not change hidden or archived threads. If a move fails, report it and continue
the underlying work; board bookkeeping must not block the task.

`bb kanban list [--project <id>] [--offset 100] [--json]` lists cards.
The CLI defaults to the invoking thread/project. Outside a thread, pass
`bb kanban move <column> --thread <id>`; the project is inferred from that thread.
Moving cards changes Kanban metadata only. It does not start, stop, archive,
message, delete, or change a thread's runtime status.
