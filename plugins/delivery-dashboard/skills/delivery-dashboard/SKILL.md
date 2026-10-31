---
name: delivery-dashboard
description: Configure or inspect the Delivery Dashboard BB plugin's personal GitHub velocity and contributor comparisons.
---

# Personal velocity

Open Personal velocity from sidebar navigation (or More). In Settings → Plugins →
Delivery Dashboard, configure `usernames` (default KyleMyers001), optional shared
`comparisonRepositories`, `days` (1–365), and `refreshSeconds` (60–3600).
People/repositories accept commas or newlines, with limits of 10/20.

The page’s Week/Month/6 months/Year controls request rolling 7/30/180/365-day
views. The merge chart uses real UTC daily/weekly/monthly buckets, including
zero-activity buckets. View data shows exact boundaries; points support keyboard
focus and touch. The selected span applies to metrics and comparisons together.
`days` remains the default span for legacy status/refresh calls. Each page span
has an independent cache and automatic refresh.

Requests use `gh api` and the existing CLI login on the BB server machine by
default. Ensure gh is on PATH and run `gh auth login` there if needed. The plugin
does not extract CLI credentials. Each separate machine uses its own CLI login.
An optional `token` setting overrides CLI authentication with direct HTTPS;
never request or print its value in chat. Access depends on the selected account.
Settings are per BB server/data directory.

```sh
bb plugin config delivery-dashboard set usernames KyleMyers001
bb plugin config delivery-dashboard set comparisonRepositories owner/repository
bb plugin rpc call delivery-dashboard status
bb plugin rpc call delivery-dashboard refresh
```

Blank comparisonRepositories measures all visible authored/reviewed work,
including repositories the person does not own. Add usernames later for a
selector and side-by-side comparison on the same scope/window.

Merged/opened/open PRs are attributed to the author. Median merge time includes
draft time. Reviewed PRs are GitHub review contributions (one per PR), not review
comments. Previous-period merged counts cover the preceding equal window.
Unavailable data is —; valid zero activity remains 0.

Optional `repository`/`environment` settings enable collapsible repository-level
deployment and CI context. See README.md for metric definitions, visibility,
scan limits, and installation details. Settings apply without reload.
