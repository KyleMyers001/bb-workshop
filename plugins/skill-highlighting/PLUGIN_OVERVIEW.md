## Composer syntax highlighting

Slash-style skill tokens stand out using the active theme's accent, a subtle
background, and an underline. Supported forms include `/developer` and
`/skill:developer`. BB continues to own drafts, mention pills, keyboard
handling, and submission.

## Scope

Highlighting is syntax-only: it does not validate installed skills or invoke
them. URL segments, multi-part paths, and filename extensions are excluded;
a single-component path can still look like a command. There are no settings,
network requests, backend state, or injected skills.

## Requirements

Built against BB Plugin SDK 0.6.104. Enable or disable the plugin through BB's
plugin controls. Disabling removes the paint effect without changing drafts.
