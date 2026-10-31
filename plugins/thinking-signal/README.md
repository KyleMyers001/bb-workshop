# Thinking Signal for BB

A reversible, local sidebar enhancement based on Kyle’s selected Thinking Signal SVG concept. Five theme-accent bars animate only in a thread row’s existing working-indicator slot. BB still owns the original icon, accessible label, status transitions, and row interactions.

## Install and rollback

```sh
# Install workspace dependencies from ~/Development/bb-workshop first:
npm ci --prefix ../.. --include=dev
npm test
npm run typecheck
bb plugin build .
bb plugin install . --yes

# Restore BB’s original spinner, without removing files:
bb plugin disable thinking-signal
# Try the signal again:
bb plugin enable thinking-signal
```

Reloads should apply live. If an existing client misses activation, reload that BB window.
Use the [root installation guide](../../README.md) for verified full cutover
from the permanent monorepo paths.

## Scope and limitations

- No network requests, credentials, settings, polling, or backend persistence.
- Only `[data-sidebar-thread-trailing-indicator]` with a direct Loading SVG labeled `Thread working` is decorated. Other surfaces, collapsed group summaries, drafts, waiting states, and errors are untouched.
- Uses BB’s `--primary` rather than a fixed lavender, and respects reduced motion.
- The source SVG remains in the accessibility tree; the overlay is decorative.
- This is a trusted content-script DOM enhancement, not a stable status-renderer API. BB markup changes may make the enhancement stop matching; it then leaves the original spinner visible. Verified against SDK 0.6.104.
- Mutation observation is incremental: it inspects added nodes and affected slots, not full-document rescans or navigation polling. Disable/reload removes overlays and disconnects the observer.

The standard scaffold’s unused todo UI files remain on disk but are excluded from TypeScript inputs, Git, and plugin surfaces. No example skill or todo CLI is registered.

## Verification

Four SDK-harness DOM tests cover targeting/accessibility, inserted rows and status changes, detached-node cleanup/disable, and reloads. Browser checks exercise real BB CSS, theme color, animation, reduced motion, and enable/disable behavior.
