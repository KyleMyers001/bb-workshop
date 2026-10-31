# Delivery Dashboard — Personal velocity

A BB sidebar dashboard focused on individual GitHub activity. Starts with
`KyleMyers001`; add teammates later through settings. No remote service besides
GitHub is used, and the plugin does not publish data or write to GitHub.

## Permanent local installation

Keep this package at `~/Development/bb-workshop/plugins/delivery-dashboard`,
inside the permanent monorepo and outside BB-managed workspaces. BB loads path plugins **in place**; it does not retain a
source copy. Archiving a thread can delete its managed workspace, so never
install this plugin from a thread's temporary directory.

Source is tracked in the public monorepo, with one root workspace lockfile.
Use the root backup command after committing changes on a feature branch;
local snapshots are not automatic or off-machine backups. See
[recovery guidance](../../docs/recovery.md) for provenance and restoration.

## Install and configure

```sh
cd ~/Development/bb-workshop
npm ci --include=dev
npm run install:local -- --dry-run
npm run install:local -- --apply
```

Open **Settings → Plugins → Delivery Dashboard**:

| Setting | Behavior |
| --- | --- |
| `usernames` | Comma/newline-separated GitHub usernames, up to 10; defaults to `KyleMyers001` |
| `token` | Optional explicit token override; leave blank to use the existing `gh` login |
| `comparisonRepositories` | Optional common list of up to 20 `owner/repository` names; blank includes all repositories visible to the signed-in account, including contributions to repositories the person does not own |
| `days` | Default background/CLI lookback, 1–365 days; default 7. The page has its own range controls. |
| `refreshSeconds` | Automatic refresh every 60–3600 seconds; default 300 |
| `repository` | Optional single repository for the collapsible delivery context |
| `environment` | Deployment environment for repository context; default `production` |

By default the plugin runs `gh api` on the BB server machine, reusing GitHub
CLI authentication without reading or copying its stored credentials. Ensure
`gh` is on the server process PATH and sign in once with `gh auth login` on
each separate BB server machine. Requests explicitly target github.com.
The active `gh` account/environment determines repository access.

An existing optional token setting takes precedence and uses direct HTTPS.
Enter an override only in the plugin's secret settings field or a secure flow;
it remains server-side. Account permissions, repository selection, and
organization/SSO authorization determine visible private data. Optional
repository context needs Actions and Deployments read access.

Click **Personal velocity** in the sidebar navigation (or under **More** if the navigation is collapsed).
Settings apply without reloading. Additional people enable a person selector
and a comparison table; all use the same account visibility, repositories, and
window.

## Time spans and chart

Use **Week**, **Month**, **6 months**, or **Year** on the page. These are rolling
7-, 30-, 180-, and 365-day windows, shown explicitly beside the controls.
Changing the span updates every person’s metrics, the previous-period comparison,
repository context, and merge-activity chart together. Open PRs remains a current
count. Each span is cached independently and refreshes at the configured interval.

The chart uses real merge timestamps: daily buckets for Week/Month, weekly
buckets for 6 months, and UTC calendar months for Year. Edge weeks/months may
be partial. Empty buckets display zero; unavailable history displays an error
instead of a synthetic line. Hover, tap, or keyboard-focus a point for its count.
**View data** opens a table with exact UTC bucket boundaries.

## Personal metrics

- **PRs merged:** authored PRs merged during the window, regardless of who
  clicked Merge. Shows the count from the preceding equal-length window and
  the absolute change.
- **PRs opened:** authored PRs created during the window.
- **Median time to merge:** hours from creation to merge for PRs merged in
  the window. Includes draft time and PRs created before the window. No merges
  displays `—`. This measures end-to-end flow, not active coding time.
- **PRs reviewed:** GitHub review contributions during the window. GitHub
  records the most recent review per PR; this is not review-comment count or
  total review submissions. Scoped results sum matching repository groups.
- **Open PRs:** current authored open PRs, including drafts; not window-limited.
- **Merge throughput:** merged count × 7 / window days, normalized per week.

These reflect GitHub activity, not story points, task difficulty, or work in
other tools. For team comparisons, select a shared repository scope and take
roles and task size into account. With no scope, each person is measured across
their visible contributions throughout GitHub. Counts depend on GitHub search
indexing and access; they may lag recent changes.

The previous/current windows do not overlap. PR search results and review
contributions are fetched at refresh time rather than being a historical
snapshot of what the dashboard displayed at each point in time.

## Repository context

The optional collapsible section retains deployment frequency, all-author
open PR count, and CI pass rate. These are repository-wide metrics.
Deploy frequency counts deployment records created during the window that have
at least one successful status, including later-inactive deployments, divided
by days. It requires GitHub Deployment records. CI pass rate is successful /
all completed Actions workflow runs created during the window across workflows
and branches. Cancelled and skipped runs count in the denominator. No runs
shows `—`.

## Limits and lifecycle

Personal collection processes two people concurrently. History searches above GitHub’s 1,000-result cap are split into non-overlapping
time ranges and paginated within each range. Collection allows up to 64
additional history requests per person/span. Incomplete scans show an error for
the chart and median while retaining available counts. Scoped review aggregation supports at most 100 repositories
with review activity per person; above that, reviews display an error instead
of a partial count. Other people remain usable if one user fails.

Repository context scans at most 1,000 items per collection and 200 recent
deployments, with at most five concurrent deployment status reads. Limits show
errors rather than truncated counts. Shorten the window when a scan is too big.

Requests time out after 15 seconds each and abort on reconfiguration, reload,
or shutdown. Concurrent refreshes share one collection. The server refreshes
even when the dashboard is closed. Clients reconcile through realtime and a 15-second
cache poll. Snapshots live in memory; a restart collects again. CLI/authentication errors,
API failures, and absent activity are distinguished. Snapshots older than two
refresh intervals are marked stale.

Settings and secrets belong to the BB server/data directory, not the checkout.
Installing the source into a separate BB server on a work machine starts with
separate settings and uses that server machine’s gh login. Clients connected to the same BB server
share its settings. No automatic sync/export or token copying is provided.

## Development

```sh
npm test
npm run typecheck
bb plugin types --check
npm run build
bb plugin dev
```

Tests cover collection, pagination/splitting, UTC buckets, per-person isolation, period boundaries,
configuration, lifecycle, and dashboard comparisons. Live authenticated GitHub
results were verified using the installed plugin and existing gh login.

API definitions: [GitHub contribution collections](https://docs.github.com/en/graphql/reference/users),
[pull requests](https://docs.github.com/en/graphql/reference/pulls),
[deployment statuses](https://docs.github.com/en/rest/deployments/statuses), and
[workflow runs](https://docs.github.com/en/rest/actions/workflow-runs).
