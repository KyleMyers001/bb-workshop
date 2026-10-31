# Agent Activity

Option A: one compact sidebar-footer line with running and needs-you counts.
Click a count to open its threads, with project names. Errors get a separate
count when present. Phone, bug reporting, More, and other plugins stay owned by
BB. Opening a thread never starts, stops, approves, or sends agent work.

Uses the public `experimental_useSidebarThreads()` cache and BB's existing
realtime updates: no polling, backend reads, transcript inspection, or private
application imports. Pending structured questions/approvals take priority over
running. Counts exclude hidden and archived threads. Starting/stopping,
provisioning/offline, and idle plans/goals are not called running. Actual idle
background agents, commands, and workflows do count. Plain-text questions in
an ended chat turn cannot reliably be identified as blockers.

Loading, query failures, and disconnected realtime show explicit unavailable
states rather than misleading counts. Lists initially render 30 threads with a
Show more control. Desktop uses the version-matched BB popover; compact screens
use its responsive drawer. Modified link clicks keep normal browser behavior.

## Experimental footer integration

BB SDK 0.6.104's managed footer API supports icons, not text-count components.
A cleanup-safe content script adds an owned `<li>` before the host controls in
`[data-sidebar="footer"] > [data-sidebar="menu"]`. An app overlay portals the
React controls into that anchor. Host controls are neither moved nor restyled.
The host retains responsibility for overflow and hidden utility items.

This DOM selector is the compatibility seam: a future BB footer markup change
may hide the counts until updated. Compact thread navigation also uses the host's
`[data-sidebar="trigger"][aria-expanded="true"]` button to close its drawer,
because the overlay navigation API has no drawer-dismiss action. No BB application source is patched, no
settings are changed on install, and disabling the plugin restores the original
footer. Every observer and owned node is disposed on abort/reload. The
content script is full-trust, like the other workshop visual extensions.

The popover opens the selected thread; BB owns the actual question/approval UI.
The live sidebar cache exposes whether a prompt is pending, not its full content,
so the row says “Question or approval” rather than guessing the prompt type.

## Develop / try

From the workshop root:

```sh
npm test --workspace plugins/agent-activity
npm run typecheck --workspace plugins/agent-activity
npm run sdk:check --workspace plugins/agent-activity
npm run build --workspace plugins/agent-activity
bb plugin install path:$PWD/plugins/agent-activity --yes
```

Install only from the permanent workshop checkout, never from a BB-managed
workspace. For subsequent verified edits, run `bb plugin reload agent-activity`.
To stop trying it, disable Agent Activity in BB's Plugins page.

The vendored popover/support source comes from the registry pinned by
`components.json` (BB release 0.48.1). The plugin itself pins SDK 0.6.104.
