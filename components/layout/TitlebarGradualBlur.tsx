type TitlebarGradualBlurProps = {
  edge?: "top" | "bottom";
  testId?: string;
  className?: string;
};

/**
 * One continuous edge effect: a bounded backdrop-filter and theme-aware veil
 * share one short 72px fade on the wrapper. The continuous mask makes the
 * strongest blur hug the window edge and releases normal content quickly.
 * The filter lives on that wrapper because
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
      data-effect-height="72"
      data-effect-edge={edge}
      aria-hidden="true"
      style={{
        backdropFilter: "blur(14px) saturate(1.08)",
        WebkitBackdropFilter: "blur(14px) saturate(1.08)"
      }}
    >
      <span className="desktop-titlebar__veil" />
    </div>
  );
}
