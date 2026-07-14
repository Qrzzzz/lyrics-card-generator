import type { CSSProperties } from "react";

const TITLEBAR_BLUR_MASK = "linear-gradient(to bottom, #000 0%, #000 64%, rgba(0,0,0,0.82) 78%, rgba(0,0,0,0.46) 90%, transparent 100%)";

/**
 * One continuous titlebar effect: a bounded backdrop-filter and theme-aware
 * veil share the same 144px fade envelope. The measured desktop
 * layout places the 48px titlebar edge at y=48 and the first Stepper rail at
 * y=62, so the effect reaches well into real content instead of ending above
 * it. This intentionally has no runtime observers, animation, or injected CSS.
 */
export function TitlebarGradualBlur() {
  return (
    <div
      className="desktop-titlebar__gradual-blur"
      data-testid="titlebar-gradual-blur"
      data-effect-height="144"
      aria-hidden="true"
    >
      <span
        className="desktop-titlebar__blur-layer"
        style={{
          backdropFilter: "blur(22px) saturate(1.18)",
          WebkitBackdropFilter: "blur(22px) saturate(1.18)",
          maskImage: TITLEBAR_BLUR_MASK,
          WebkitMaskImage: TITLEBAR_BLUR_MASK
        } satisfies CSSProperties}
      />
      <span className="desktop-titlebar__veil" />
    </div>
  );
}
