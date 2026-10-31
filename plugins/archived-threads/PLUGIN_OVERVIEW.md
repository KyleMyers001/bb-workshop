# Archived Threads

- **Navigation:** `archived-threads/archived`, title **Archived**, Archive icon.
- **Backend:** required no-op plugin factory; no services, RPC or storage.
- **Frontend:** `app.tsx` owns the page and search/paging state;
  `use-archived-threads.ts` reads the public SDK with cancellation;
  `archive-row.tsx` opens native conversations.
- **Data:** `threads.list` with `archived: true` and `includeHidden: false`;
  `threads.search` consumes only its archived group; `projects.list` supplies
  display names. Deleted, hidden and active rows are excluded from display.
- **Safety:** the plugin never calls thread write APIs. Opening native BB
  conversations can use BB's ordinary read-status behavior, but never sends a
  prompt, unarchives a thread, or restores a workspace.
- **Theme:** vendored BB controls and host theme tokens, no global CSS.
- **Skills:** disabled (`bb.skills: []`); unused scaffold example is ignored.

See README.md for install, verify, reload and disable commands.
