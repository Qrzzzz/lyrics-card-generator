import type { CSSProperties } from "react";

const TITLEBAR_BLUR_LAYERS = [
  {
    top: 0,
    height: 84,
    blur: 30,
    mask: "linear-gradient(to bottom, #000 0%, #000 38%, rgba(0,0,0,0.82) 68%, transparent 100%)"
  },
  {
    top: 24,
    height: 78,
    blur: 21,
    mask: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.72) 18%, #000 42%, rgba(0,0,0,0.72) 70%, transparent 100%)"
  },
  {
    top: 52,
    height: 70,
    blur: 13,
    mask: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.68) 18%, #000 46%, rgba(0,0,0,0.62) 74%, transparent 100%)"
  },
  {
    top: 80,
    height: 64,
    blur: 6,
    mask: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.62) 18%, #000 44%, rgba(0,0,0,0.52) 70%, transparent 100%)"
  }
] as const;

/**
 * One continuous titlebar effect: four overlapping backdrop-filter bands and
 * a theme-aware veil share the same 144px fade envelope. The measured desktop
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
      {TITLEBAR_BLUR_LAYERS.map(({ top, height, blur, mask }) => {
        const filter = `blur(${blur}px) saturate(1.18)`;
        const style: CSSProperties = {
          top,
          height,
          backdropFilter: filter,
          WebkitBackdropFilter: filter,
          maskImage: mask,
          WebkitMaskImage: mask
        };

        return <span key={blur} className="desktop-titlebar__blur-layer" style={style} />;
      })}
      <span className="desktop-titlebar__veil" />
    </div>
  );
}
