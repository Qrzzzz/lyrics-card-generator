# SaltUI-inspired controls

The shared React controls adapt SaltUI's visual design to the existing Electron,
Next.js and Web Lite renderers. They do not load Compose or a Kotlin runtime.

Reference: https://github.com/Moriafly/SaltUI (Apache-2.0, Moriafly).
The bundled license and attribution are in `public/licenses/`.
SaltUI credits Alexander Kolpakov's SwitcherX for the ring-to-bar switch design.

## Adaptation

- Capsule action buttons distinguish filled primary actions from neutral, ghost,
  icon and destructive actions. Existing button heights and public props remain.
- Switches use a 46 by 26 px track, an unchecked ring and a checked bar. Travel
  takes 200 ms; CSS morphing takes 320 ms rather than SaltUI's 800 ms.
- Text fields and sliders retain their pre-adaptation styles and native input
  semantics. They are not part of the SaltUI visual adaptation.
- Options use 12 px corners; settings groups use 20 px corners,
  quiet theme surfaces and 16 px padding. Labels and responsive grids retain
  their existing order and behavior.
- Hover changes the surface without lifting shared controls. Press feedback
  uses the existing control springs. Reduced-motion settings disable travel
  animations without hiding the selected state.

`resolveControlAccentTokens` supplies contrasting text/icons and hover colors
for album, preset and custom accents in both renderers. Acrylic text and input
boundary tokens remain governed by the existing contrast floor.

## Verification

Use the existing settings layout browser scenarios for six languages, four
themes, enlarged root text, narrow windows, focus retention and axe checks.
The contrast regression covers filled and hovered actions with black, white
and all preset accent colors. The settings-wing contract covers the rounded
group surfaces. Native window effects are outside this adaptation.
