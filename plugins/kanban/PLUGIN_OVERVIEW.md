# Kanban plugin structure

- `server.ts`: RPC, agent tool/configuration, and lifecycle refresh signals.
- `board.ts`: thread listing, validated metadata reads, and atomic card moves.
- `cli.ts`: declarative `bb kanban list` and `bb kanban move` commands.
- `contract.ts`: validated RPC and tool boundaries.
- `model.ts`: columns, card shape, page size, and realtime channel.
- `app.tsx`, `board-card.tsx`, `use-board.ts`, `app.css`: project board,
  accessible controls, drag-and-drop, stale-response handling, and theme styles.
- `skills/kanban-board/SKILL.md`: agent workflow instructions.
- `server.test.ts`, `app.test.tsx`: public SDK host and frontend harness checks.

Thread metadata keys: `column`, `note`, `movedAt` (epoch milliseconds), and
`movedBy` (`agent`, `user`, or `cli`). Updates preserve unrelated namespace keys.
Malformed metadata is treated as unsorted data. No private BB imports, custom
server endpoints, background workers, or application database access are used.
