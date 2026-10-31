# Skill Highlighting for BB

Local experimental composer customization, built against BB 0.48.1 / SDK 0.6.104.

Highlights slash-style tokens such as `/developer`, `/code-critique`, and
`/skill:developer` using the active theme's accent, a subtle background, and an
underline. It uses BB's paint-only `richText.effects`: drafts, mention pills,
keyboard handling, and submission remain owned by BB.

## Scope and limitations

- Syntax highlighting only: a match does **not** confirm a skill is installed or
  invoke it. Unknown slash commands also highlight.
- Lowercase names with digits and hyphens; token boundaries reject URL segments,
  multi-part paths, filename extensions, and incomplete `/skill:` prefixes.
- A single-component absolute path such as `/tmp` is indistinguishable from a
  command and will highlight. This is not a Markdown parser.
- Applies to BB's supported composer scopes; live verification covered the
  new-thread and thread composer, not queued-message editing or mobile.
- A bare, null-rendering banner is registered solely to mount BB's plugin CSS.
  Effect-only registrations do not load their stylesheet in BB 0.48.1.
- No server behavior, settings, persisted state, network requests, or injected
  skills. Unused vendored UI/scaffold files are not imported; the scaffold's
  example skill is explicitly disabled via `bb.skills: []`.

## Local development

Install dependencies once from the monorepo root with `npm ci --include=dev`.
This package remains independently testable/buildable from its directory.
See the [root installation guide](../../README.md) for stable paths and cutover.

```sh
npm test
npm run typecheck
npm run build
bb plugin install . --yes
bb plugin reload skill-highlighting
```

The Node test command requires Node 22.6+ with type stripping (verified on
Node 24). `bb plugin types --check .` checks the pinned SDK.

## Disable

```sh
bb plugin disable skill-highlighting
```

Re-enable with `bb plugin enable skill-highlighting`. No BB core or Voxloom
files were modified. This plugin is installed from this local directory; do
not move it while it is installed.
