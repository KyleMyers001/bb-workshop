# Security Dashboard

A team Dependabot inbox for an **explicit repository list**, independent of BB projects, local checkouts, and GitHub team memberships. SDK 0.6.104; plugin ID `security-dashboard`.

## Use

Open **Security → Repositories & scope** and enter up to 50 `owner/repository` names, one per line or comma-separated. Save, then refresh. The same list is available as the plugin's `repositories` setting. The default is empty: nothing is discovered, cloned, or monitored automatically. GitHub team access never expands the watch list.

Requires the GitHub CLI (`gh`) installed and authenticated **on the BB server machine**, with access to Dependabot alerts for each watched repository. Use your organization's approved authentication mechanism. This first version supports GitHub.com and the server's current gh identity only; it does not export or store a token. An ordinary team member can use per-repository access without assuming organization security-manager permissions. Dependabot enablement, token permissions, SSO, and repository permissions still govern availability.

The alert inbox searches repository/package/advisory text and filters severity and patch availability. Findings sort by severity, then oldest first. Repository coverage distinguishes pending, readable, limited, and unavailable. Unavailable counts remain unknown, never zero. The inbox refreshes every five minutes while mounted; Refresh requests an immediate collection. Existing data is labeled stale after ten minutes or a failed RPC. No background monitoring or notifications run while the page is closed.

## Investigation and work tracking

Open a finding to inspect its manifest, vulnerable range, first patched version, dependency scope, and original GitHub alert. Reachability is not assessed. A first patched version is not necessarily a compatible direct upgrade.

**Prepare investigation brief** generates selectable text for an explicitly chosen BB thread or external workflow. It creates no project, environment, checkout, or thread and launches no agent. The brief asks for an investigation, not code changes or alert dismissal. Use remote repository review when appropriate; local tests require an intentional checkout.

Record a manual Investigating status or link a GitHub PR. PR open requires a GitHub.com PR URL without credentials, query, or fragment. This plugin does **not** synchronize PR state or checks, infer closure from a PR, or change GitHub alerts. “PR open” is manually tracked. GitHub's current open-alert listing controls the inbox; a missing finding under failed coverage is not evidence of a fix. Work metadata persists in the plugin's SQLite database across reloads, including when a repository leaves the watch list. Alert data is memory-only and recollected after reload.

## Limits and safety

- Dependabot only; no code scanning, secret scanning, Jira integration, automatic team ownership inference, or automatic fixes.
- At most four GitHub CLI requests run concurrently. Each repository reads at most two 100-item cursor pages. Larger sets display **limited** with lower-bound counts and a GitHub link; they are never labeled fully readable.
- Errors and malformed responses make that repository unavailable. Partial failed collections are not reported as complete or as zero alerts. Diagnostics never include raw CLI stderr or upstream response bodies.
- Requests are GET-only and constrained to the GitHub.com Dependabot endpoint. Pagination consumes a validated cursor, not an arbitrary destination URL. Child processes have time/output limits and are cancelled on scope change or disposal.
- Concurrent watch-list edits are rejected rather than silently overwriting a newer scope. Drafts survive an external scope change until explicitly reloaded.
- Nothing dismisses alerts, installs packages, changes theme/settings on installation, creates checkouts, launches agents, or merges PRs.

## Development

From the repository root, run `npm test --workspace plugins/security-dashboard`, `npm run typecheck --workspace plugins/security-dashboard`, `npm run sdk:check --workspace plugins/security-dashboard`, and `npm run build --workspace plugins/security-dashboard`. Root verification and installation use the shared scripts and root lockfile. No generated builds or runtime data belong in Git.
