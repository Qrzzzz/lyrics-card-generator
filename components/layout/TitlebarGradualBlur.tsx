import type { CSSProperties } from "react";

const TITLEBAR_BLUR_LAYERS = [
  {
    blur: 30,
    mask: "linear-gradient(to bottom, #000 0%, #000 24%, rgba(0,0,0,0.82) 44%, transparent 70%)"
  },
  {
    blur: 21,
    mask: "linear-gradient(to bottom, transparent 10%, rgba(0,0,0,0.72) 24%, #000 42%, rgba(0,0,0,0.72) 60%, transparent 80%)"
  },
  {
    blur: 13,
    mask: "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.68) 44%, #000 58%, rgba(0,0,0,0.62) 74%, transparent 92%)"
  },
  {
    blur: 6,
    mask: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.62) 64%, #000 76%, rgba(0,0,0,0.52) 88%, transparent 100%)"
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
      {TITLEBAR_BLUR_LAYERS.map(({ blur, mask }) => {
        const filter = `blur(${blur}px) saturate(1.18)`;
        const style: CSSProperties = {
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
