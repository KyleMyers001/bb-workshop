# Workbench

A read-only Markdown library inside BB. Browse approved document folders, search
titles and contents, preview documents, and open a focused reader with an outline.
It does not edit, rename, delete, or create source files.

## Source and privacy

The source is on the **BB server machine**, not whichever device opens BB.
Defaults are `~/Workbench` and its `Reports`, `Plans`, `Investigations`, `Designs`,
and `Handoffs` folders. Change `root` and the newline-separated `folders` in
Settings → Plugins → Workbench. Folders are relative to the root and cannot
contain hidden components or overlap. No installation hooks change settings,
appearance, or other plugins.

Search is local and offline. The index caches searchable text in this plugin's
private BB database, outside Workbench. It is not a backup. Nothing is uploaded
to a search service. Anyone already authorized to use this BB instance can
read the approved documents; this is not a per-user document authorization system.
Do not include credential folders or unrelated private directories.

Symbolic links, hidden paths, `node_modules`, `dist`, `build`, and `Worktrees`
(case-insensitive) are excluded. Only regular UTF-8 `.md` and `.markdown` files
up to 2 MiB are read. Scans are bounded to 20,000 documents, 1,000,000 entries,
128 MiB of source text, and 30 nested directory levels. Hitting a global limit
fails the scan instead of silently publishing a truncated library. Missing or
unreadable folders and skipped files are reported in the UI.

The source tree is never written to. Filesystem reads can update access times
according to the operating system; contents and modification times are not changed.

## Search

- Empty query: newest added first. There are explicit added/updated sorts.
- Typed query: SQLite FTS5 BM25, with title and heading/path weights above body
  text. Filenames and work IDs remain searchable even when the H1 is different.
  Exact normalized titles rank first. A maximum 8% freshness multiplier breaks
  close calls without turning a weak match into a strong one.
- Words use prefix matching; double quotes require an exact phrase. Punctuation
  and FTS operators are treated as text, not executable query syntax.
- When there are no matches, a labelled, bounded one-edit/adjacent-transposition
  spelling fallback is attempted. Explicit phrases are never corrected.
- Folder filtering happens before pagination; results load 50 at a time.
- Creation time is used when available. An initial import without creation dates
  says “date unknown”; later discoveries use first-seen time. Known dates survive
  refreshes, removal/reappearance at the same path, and restarts. “Added” is
  distinct from modification time; copied/restored files inherit the creation
  timestamps supplied by that filesystem.

Indexing runs every 30 seconds, with a manual **Refresh** action. Only changed
files are reparsed. Search can lag filesystem changes by one scan interval;
opening a document always checks and reads the current approved file. The last
complete index stays responsive during background scans; a failed rescan is
labelled rather than replacing it with partial results. Scans are single-flight,
and source-setting changes cannot publish an obsolete scan.

## Reader

CommonMark/GFM headings, tables, code, and disabled task checkboxes are supported.
Code uses BB's themed source viewer. YAML frontmatter is omitted from display
and search. Relative Markdown links and unambiguous `[[wiki links|labels]]`
resolve within the indexed collection. Relative raster images are read through
a bounded, validated plugin endpoint. PNG, JPEG, GIF, and WebP are supported;
SVG and remote/data images are not loaded. Raw HTML is skipped, not executed.
External HTTP(S) links use BB's normal link behavior.

Focus mode retains search/filter state. Its outline supports keyboard use and
becomes a heading selector at compact widths. Document selections use BB's own
panel navigation so direct links and browser back/forward work.

This replaces finding and reading artifacts, not the whole Obsidian application.
Quick find, editing, graphs, PDF/HTML viewing, wiki embeds, synchronization, and
semantic/embedding search are not part of this first release.

## Development

From the repository root, after `npm ci --include=dev`:

```sh
npm test --workspace plugins/workbench-reader
npm run typecheck --workspace plugins/workbench-reader
npm run sdk:check --workspace plugins/workbench-reader
npm run build --workspace plugins/workbench-reader
npm run verify
npm run install:local -- --dry-run
```

The permanent installed path is `~/Development/bb-workshop/plugins/workbench-reader`.
Use the root lockfile and SDK 0.6.104. No generated builds, index data, source
documents, or configuration exports belong in this public repository.
