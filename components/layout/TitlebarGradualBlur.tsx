type TitlebarGradualBlurProps = {
  edge?: "top" | "bottom";
  testId?: string;
  className?: string;
};

/**
 * One continuous edge effect: a bounded backdrop-filter and theme-aware veil
 * share one 144px mask on the wrapper. The filter lives on that wrapper because
 * a masked parent would otherwise form a backdrop root that starves a child
 * backdrop-filter of the content behind the effect.
 */
export function TitlebarGradualBlur({
  edge = "top",
  testId = "titlebar-gradual-blur",
  className
}: TitlebarGradualBlurProps = {}) {
  return (
    <div
      className={[
        "desktop-titlebar__gradual-blur",
        edge === "bottom" ? "desktop-titlebar__gradual-blur--bottom" : "",
        className ?? ""
      ].filter(Boolean).join(" ")}
      data-testid={testId}
      data-effect-height="144"
      data-effect-edge={edge}
      aria-hidden="true"
      style={{
        backdropFilter: "blur(22px) saturate(1.18)",
        WebkitBackdropFilter: "blur(22px) saturate(1.18)"
      }}
    >
      <span className="desktop-titlebar__veil" />
    </div>
  );
}
