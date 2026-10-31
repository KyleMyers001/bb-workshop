# BB Workshop

Public personal BB customization monorepo; keep changes about organization,
durability, and the requested plugin—not unrelated feature redesign.

- Work on feature branches. Never commit or push to main/master. PR merges
  require explicit user approval. Preserve original plugin histories privately;
  this public repository starts from a sanitized source snapshot. Never push
  private source-history branches, --all, or --mirror to the public remote.
- Confirm destructive operations first. Keep original source checkouts and
  backups intact; deleting them requires separate explicit confirmation.
- Never track credentials, settings exports, BB databases/runtime, raw session
  transcripts, recovery logs, bundles, node_modules, or generated builds.
  This repository is public: inspect current content and history before push.
- Installed paths must be permanent, outside BB-managed workspaces. Reinstall
  the same IDs from new paths; never use plugin remove for migration/rollback.
- Use npm workspaces and only the root package-lock.json. Preserve each plugin's
  identity, behavior, and SDK 0.6.104 compatibility. No unnecessary shared library.
- Read the installed bb-plugin-authoring guidance before SDK changes. Keep
  themes standalone. Do not change appearance/settings as an installation side
  effect. No npm lifecycle install hooks or automatic cutover.
- After root npm ci --include=dev, run npm run verify. Individual package scripts
  work from their directories or via --workspace. Test script changes with
  npm run test:scripts, including failure and dry-run paths.
- Preview cutover with npm run install:local -- --dry-run. Apply only after
  verification; confirm all IDs running, settings preserved, and UI smoke tests.
- After committing, npm run backup creates a manual local source snapshot.
  Verify important backups by cloning into a new directory. Never describe a
  local snapshot as automatic, off-machine, or a backup of BB configuration.
