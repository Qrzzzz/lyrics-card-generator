# Background composition acceptance contract

[Documentation index](../README.md) · [Development guide](../development.en.md)

This contract was introduced with the v5.10.0 background system and remains the
regression contract for the current implementation. It covers the local
readability layer and the adapter between palette extraction, the spatial color
field, preview rendering, and export. It does not redefine palette extraction or
color-field anchors.

## Automatic gates

The numeric evaluator consumes a downsampled, background-only RGB grid. Text,
cover pixels, and the optional one-pixel fine grid must be excluded before the
grid is passed to the evaluator. The default gates are:

| Constraint | Metric | Gate |
| --- | --- | ---: |
| Text safety | minimum WCAG contrast in title/metadata, lyrics and footer zones | >= 4.5:1 |
| Color discontinuity | p95 four-neighbour OKLab distance after 3x3 low-pass | <= 0.085 |
| Isolated color edge | maximum four-neighbour OKLab distance after 3x3 low-pass | <= 0.16 |
| Transition smoothness | p95 four-neighbour relative-luminance step | <= 0.075 |
| Isolated luminance edge | maximum four-neighbour relative-luminance step | <= 0.14 |
| Bright spot | pixels at luminance >= 0.78 | <= 18% |
| Dominant bright spot | largest connected bright component | <= 10% |
| Crushed dark area | pixels at luminance <= 0.025 | <= 20% |
| Dark floor | p02 luminance | >= 0.008 |
| Closed contour | enclosed bright components of at least four samples | <= 3 |
| Dominant closed contour | largest enclosed bright component | <= 10% |
| Parallel bands | strong row/column mean-step score with alternating edges | <= 0.22 |

The p95 gates describe field-wide smoothness while the maximum gates catch an
isolated hard seam. Cover, text, and fine-grid pixels must therefore be removed
before evaluation so their intentional edges cannot create false failures.

Title/metadata, lyrics, and footer protection use the same depth and are merged
into one alpha mask before the overlay color is applied. Their feathered areas
may overlap spatially, but overlap must never apply the overlay opacity more
than once or create a darker header/footer band.

## Regression matrix

`npm run background-composition:test` evaluates 120 deterministic combinations:

- palette/cover: colorful, low saturation, monochrome, local high saturation,
  transparent artwork;
- canvas: 1:1, 4:5, 9:16, 16:9, 21:9, custom 1080x4200;
- content: lyrics and instrumental (instrumental is normalized to its real 1:1
  product contract);
- fine grid: off and on.

Every case asserts deterministic output, bounded zones, no whole-card overlay,
equal zone depth, a single overlay-opacity ceiling for overlapping zones,
minimum local contrast, p95 color-difference, and p95 luminance-transition
limits. Dedicated negative fixtures prove that the pre-protection medium-grey
baseline fails contrast and that abrupt splits, closed bright contours, and
parallel bands are detected rather than silently accepted.

## Full-chain browser gates

For representative portrait, landscape, ultrawide, transparent-artwork and
super-long cases:

1. compare the visible preview card and the unscaled `ExportCardHost` using the
   same readability-zone count, roles, rectangles, overlay polarity and opacity;
2. export PNG, WebP and JPG at pixel ratios 1, 1.4 and 2, verify MIME type and
   decoded dimensions, and compare normalized screenshots with a small
   codec-specific tolerance;
3. repeat the shared DOM assertions in desktop/editor and Web Lite;
4. record `html-to-image` render duration, output byte size and peak canvas
   dimensions. A 1080x4200 card at 2x is 2160x8400 (18.1 million pixels, about
   72.6 MiB for one RGBA surface before browser/encoder copies); classify
   timeout or allocation failure separately from a composition failure.

The browser-format matrix is an integration gate. Rebuild the generated Web Lite
artifact before running it whenever shared composition or export code changes.

## Maintainer commands

```bash
npm run palette:test
npm run color-field:test
npm run background-composition:test
npm run web-lite:build
npm run web-lite:check
npm run web-lite:smoke
```

The opt-in large-canvas benchmark is separate because it records timing and
allocation diagnostics rather than acting as a fast deterministic unit gate:

```bash
npm run background-composition:benchmark
```

Changes to numeric thresholds require new negative fixtures and visual evidence.
Do not relax a threshold solely to make an existing failure disappear.

## Manual visual acceptance

Automatic metrics cannot decide whether a valid composition is attractive.
Human review remains required for:

- local tone patches are not perceived as black cards, halos, tunnels, or a
  single whole-image veil;
- title, metadata, lyrics, and footer remain readable at normal preview size,
  not only at 100% export zoom;
- no accidental closed silhouette, repeated ribbon, horizon-like parallel band,
  or bright focal point competes with the lyrics;
- grid on/off preserves hierarchy and does not create moire at 1x, 1.4x, or 2x;
- PNG/WebP/JPG differences are codec differences only, with no missing blur,
  shadow, transparency, or shifted safety zone.

Manual approval must name the exact commit, generated Web Lite file, browser,
OS, and fixture set. It must not be inferred from numeric tests alone.
