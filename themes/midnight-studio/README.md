# Midnight Studio

A standalone, opt-in reading variant of Midnight Observatory. Same palette,
code themes, sidebar, and input styling; clearer typography inside the existing
conversation. No BB fork, plugin runtime, separate reader, or agent-name banner.

Conversation Markdown uses 16px text, 1.78 line height, a maximum 74ch measure,
distinct heading sizes, calmer paragraph/list spacing, accent list markers,
and clearer quotes/inline code. Other Markdown surfaces keep Observatory's
existing 15px treatment. Native source-code blocks and table behavior remain BB's.

The composer and its fade effects are not targeted by the added rules. The
original Observatory stylesheet is retained unchanged after its identity comment;
only conversation-scoped rules are appended. This also preserves Observatory's
existing input focus halo and provider-update badge policy. The composer text
remains 15px before client zoom. Light/dark mode remains client-controlled.

## Installation and selection

Run the repository verification and inspect the dry-run first:

```sh
npm run verify
npm run install:local -- --dry-run
```

The normal local installer copies this standalone theme but does not select it.
It refuses conflicting installed files instead of overwriting local changes.
A theme-only installation can copy this directory into the location printed by
`bb theme dir`; never overwrite an existing directory without inspecting it.

After installation, select explicitly:

```sh
bb theme set midnight-studio
```

Theme selection affects every connected BB window, preserving favicon color.
Restore the current appearance without deleting any files:

```sh
bb theme set midnight-observatory
```

## Compatibility and checks

The reading rules use `[data-message-column] [data-markdown-preview]`, verified
against the installed BB conversation. These component attributes are not a
versioned renderer API; a BB markup change may require a small CSS adjustment.
No message DOM is rewritten, and streaming content remains BB-owned.

`npm run test:scripts` checks that the inherited styles/code themes are unchanged
and new rules remain scoped away from the composer, shell, and fades. Also check
real conversation rendering at narrow/wide widths in light/dark mode, with
lists, nested lists, code, quotes, tables, and long responses. Compare the native
composer and fade styles before/after; do not infer integration coverage from
a standalone mockup alone.
