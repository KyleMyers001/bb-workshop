# Recovery and source durability

## Failure mode

A plugin installed from an ephemeral BB-managed workspace lost its source
when that workspace was retired. A path installation references source in
place; BB is not a source backup. The dashboard was reconstructed and tested
before migration. Raw transcripts, extraction scripts, recovery logs, settings,
and credentials are deliberately not published here.

## Private history, public source snapshot

The original plugin repositories and their verified Git bundles retain their
unchanged histories privately. A private integration checkout also retains
the original commits through non-squashed subtree imports. None of those
private histories are published to GitHub, because historical documentation
contains machine-specific paths and recovery metadata.

This public repository starts with a **cleaned current-source snapshot**.
Its plugin implementations match the verified private integration; only public
documentation/provenance differs. Public commit hashes are not substitutes
for the retained original commits. Original checkouts and pre-migration
bundles remain separate recovery copies; migration does not edit or delete
them. Never push private history branches, `--all`, or `--mirror` to the public
remote. Public GitHub clones cannot restore private original commit ancestry.

All packages use one root workspace lockfile. The initial public migration
used `bootstrap/workshop` as its PR base and
`feat/public-customization-monorepo` as its feature branch. That migration is
complete. The stable default branch is now `main`, renamed from
`bootstrap/workshop` without rewriting history. Use feature branches and pull
requests for changes; never commit or push directly to `main` or `master`.

## Make a new source snapshot

Commit changes on a feature branch, then run `npm run backup` from the root.
The script refuses a dirty or detached checkout, chooses a fresh timestamped
and randomized filename outside the repository, bundles all refs with
`git bundle create --all`, and runs `git bundle verify`. It does not overwrite
older snapshots. Snapshot directories/files have private local permissions.

A bundle can contain **all historical tracked content**, including files later
removed. Treat bundles as private even when the present tree is public-safe.
Review full history before publishing. Git ignore rules do not remove tracked
files or historical secrets.

## Verify a restore in a new directory

Use the exact bundle path printed by the backup command. Choose a destination
that does **not exist**; do not overwrite or clean an existing checkout.

```sh
git bundle verify /absolute/path/to/snapshot.bundle
git clone /absolute/path/to/snapshot.bundle /absolute/path/to/new-restore-check
cd /absolute/path/to/new-restore-check
git fsck --full
# Compare these with the backed-up checkout:
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
npm ci --include=dev
npm run verify
```

Cloning/tests alone do not install anything. For a private history-bearing
bundle, additionally confirm original commits are reachable with
`git merge-base --is-ancestor <original-commit> HEAD`; they are intentionally
absent from public-snapshot bundles. Preserve the restore check as evidence
rather than deleting it without confirmation.

## Reconnect after source loss

Restore into a **new permanent directory** outside BB-managed workspaces.
A bundle clone initially has its bundle as `origin`; point it at the intended
GitHub repository before future fetch/push operations. Confirm the feature
branch, exact HEAD/tree, snapshot provenance, and verification results before
installation. Use private retained bundles when original histories are needed. Review `npm run install:local -- --dry-run`, then use `--apply`.
Reinstalling the same IDs from another local path preserves BB settings.
**Never use `bb plugin remove`**: it deletes settings and secrets.

For a per-plugin rollback, verify and rebuild the retained original checkout,
then reinstall the same ID from its original permanent path:

```sh
bb plugin install path:/absolute/path/to/retained-original-plugin --yes
```

Do not roll back by overwriting monorepo work or rewriting source history.
The installer never changes theme selection. Compare `bb theme show --json`
locally before/after; theme file conflicts require explicit resolution and
preservation of any customized copies.

## What this does not protect

Git bundles preserve **committed source**, including theme files and the root
lockfile. They exclude ignored/untracked source, `node_modules`, `dist`, BB
runtime state, databases, plugin configuration/secrets, GitHub CLI credentials,
and client-local preferences. Config comparisons use BB's public settings
view; secret values may be redacted. Do not export secrets into verification
logs. BB configuration requires a separate secure backup procedure.

Snapshots run only when explicitly invoked. Keeping them on the same machine
does not protect against disk loss, and no scheduler or off-machine snapshot
replication is configured. A public GitHub remote is suitable only for
reviewed source, never private configuration or recovery artifacts.
