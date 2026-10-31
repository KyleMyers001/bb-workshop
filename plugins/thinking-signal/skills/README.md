# Thinking Signal operating notes

This plugin adds only a trusted frontend content script, with no plugin-specific commands or settings. It decorates BB’s sidebar working spinner with five theme-primary bars, preserves the source accessible label, and respects reduced motion.

Use BB’s generic controls: `bb plugin disable thinking-signal` restores the original spinner; `bb plugin enable thinking-signal` restores the signal. Build with `bb plugin build ./plugins/thinking-signal`, then `bb plugin reload thinking-signal` after code changes.

The markup selector is intentionally narrow. If BB changes the Loading icon or trailing-slot markup, inspect the current DOM before changing it. Do not broaden matching to every spinner, change thread state, or infer progress/tool state from the animation.

No skills are injected into agent prompts (`bb.skills` is empty).
