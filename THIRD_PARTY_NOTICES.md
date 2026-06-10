# Third-party notices

This repository includes third-party dependencies and local assets required for the demo app.

## Runtime dependencies

JavaScript dependencies are installed from npm and are listed in `package.json` and `package-lock.json`.
Run `npm audit --omit=dev` before publishing changes.

## Fonts

The app currently bundles these local font files:

- `public/fonts/SourceHanSansSC-Heavy.otf`
- `public/fonts/SourceHanSerifSC-Heavy.otf`

These are Source Han fonts from Adobe/Google's Source Han / Noto CJK family. They are distributed under the SIL Open Font License 1.1. Keep the font files only if that license is acceptable for your GitHub publication, and preserve the license notice when redistributing them.

## Platform SVG assets

The repository keeps these SVG files because they may be useful for local customization:

- `public/platform-icons/apple-music.svg`
- `public/platform-icons/qq-music.svg`
- `public/platform-icons/netease-music.svg`

The default app UI renders neutral text/color platform badges instead of these SVG files. Before enabling or publishing official-looking brand artwork, confirm the artwork source, trademark rules, and usage permission.

## Lyrics and cover art

The app can display user-provided lyrics and remote cover URLs. Users are responsible for confirming that they have the right to use any lyrics, album art, or generated share image.
