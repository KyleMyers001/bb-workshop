# Recovery and durability

This plugin's source was reconstructed after an ephemeral managed workspace
was retired. The recovery commit retains the restored implementation and
36 tests; its original dependency lockfile was not recoverable and was
regenerated. Raw recovery evidence is kept private, outside this repository.

The unchanged recovery commit is retained privately in the original checkout
and verified local bundles. This public monorepo starts from a cleaned source
snapshot, without importing private historical documentation. Keep installed
source under the permanent
`~/Development/bb-workshop/plugins/delivery-dashboard` path, outside BB-managed
workspaces. Original standalone checkouts and pre-migration snapshots are
retained separately and are not migration cleanup targets.

Use the [monorepo recovery guide](../../docs/recovery.md) for backup creation,
restore verification, and same-ID rollback. Never run `bb plugin remove` to
reconnect a source path: that deletes settings and secrets.
