# Archived Threads for BB

A local BB plugin that adds an **Archived** destination to the navigation rail.
Browse archived conversations without mixing them into your active thread list.

- Lists visible archived threads across projects, 50 per page.
- Searches titles and messages across archived history using BB's search API.
  Search shows up to 50 results and reports when you should refine the query.
- Opens conversations through BB's native navigation. It does not unarchive
  threads, start agents, restore workspaces, or delete anything.
- Includes project names, archive dates, empty/error states, Refresh and retry.
- Registers no background services, tools, RPC mutations, skills or storage.

## Local development

Requires BB with Plugin SDK 0.6.104 or newer compatible SDK.

```sh
# Install workspace dependencies from ~/Development/bb-workshop first:
npm ci --prefix ../.. --include=dev
npm test
npm run typecheck
npm run build
bb plugin install . --yes
```

Enable **Archived** in **More → Customize navigation** if it is not visible.
The destination's navigation ID is `archived-threads/archived`.
The installation performed for Kyle also added that ID to the visible
navigation and order preferences, preserving the existing entries.

Keep the normal thread-list filter active-only:

```sh
bb thread-list prefs set threadLifecycles '["active"]'
```

For updates, build and reload this plugin:

```sh
npm run build
bb plugin reload archived-threads
```

To stop displaying it without deleting plugin data or source:

```sh
bb plugin disable archived-threads
```

This package is part of the public BB Workshop source repository, not an npm
or marketplace release. BB loads it from the permanent monorepo path, so keep
that directory. UI components are BB's version-matched scaffold components.
See the [root installation guide](../../README.md) for verified full cutover.

## Verification

Frontend tests use the public SDK's app harness. They cover registration,
read-only navigation, archived-only listing/search, pagination, hidden/deleted
filtering, empty/error/retry states, cancellation and stale responses. A public
SDK scan rejects private imports. Live Chromium checks cover navigation,
search and opening an archived test thread without unarchiving or restarting it.

The browser refreshes on entry, Search and Refresh; there is no background
polling. Search uses BB's server search ordering and limit. Offset pagination
can shift if another window archives/unarchives threads while you browse.
