# Delivery Dashboard architecture

- `server.ts`: settings, typed RPC, per-span in-memory snapshots, coalesced refresh,
  background lifecycle and settings invalidation/cancellation.
- `velocity.ts`: GitHub GraphQL reads for per-author PR activity and review
  contributions; scoped comparisons, period windows, median merge times, bounded time-range splitting beyond the search-result cap.
- `history.ts`: UTC daily, weekly and monthly merge buckets with zero-filled gaps.
- `activity-chart.tsx`: responsive SVG chart, keyboard/touch point inspection and data table.
- `velocity-model.ts`: person schemas, configuration validation and list parsing.
- `gh-api.ts`: bounded, cancellable gh api transport using the server machine’s
  existing login; no credential extraction or shell interpolation.
- `github.ts`: optional bounded GitHub REST deployment/CI repository context.
- `model-base.ts` / `model.ts`: shared schemas and snapshot contract.
- `app.tsx`: sidebar page lifecycle, manual refresh, repository context and definitions.
- `people-panel.tsx` / `metric-value.tsx` / `app.css`: person metrics, comparisons
  and themed responsive layout.
- `tests/`: data, backend lifecycle/settings/concurrency, public-SDK imports,
  and dashboard rendering/interaction.

The components, hooks, and lib directories contain BB's scaffolded UI sources.
A sidebar navigation page is registered. No plugin CLI command, agent tool, or GitHub mutation is registered.
Settings and tokens are per BB server; copying this package does not copy them.
