# Midnight Observatory

A standalone custom BB theme. No app-source, zoom, keyboard, or plugin
settings are changed. Theme activation applies to all
connected BB windows; light/dark mode remains per client.

Apply:

```sh
bb theme set midnight-observatory
```

Restore the previous appearance:

```sh
bb theme set tokyo-night-storm
```

The original `tokyo-night-storm` files are untouched. Favicon color is preserved.
No file deletion is needed to undo this theme.

Chat Markdown and composer text increase from 13px to 15px before desktop
zoom. Navigation and utility controls retain their existing size. Source-code
colors retain the previous Tokyo Night / GitHub Light pairing.

The palette uses supported BB CSS tokens. The small component overrides at the
end of `theme.css` use selectors verified against this installed BB version;
future BB markup changes may require updating those overrides.
