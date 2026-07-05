"use client";

import { withAlpha } from "@/lib/palette-background";
import { getReadableForegroundColor } from "@/lib/contrast-color";

export function ExplicitBadge({
  show,
  textColor,
  className = ""
}: {
  show?: boolean;
  textColor: string;
  className?: string;
}) {
  if (!show) {
    return null;
  }

  const backgroundColor = withAlpha(textColor, 0.6);

  return (
    <span
      aria-label="Explicit"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-[0.2em] align-middle font-mono font-black leading-none ${className}`}
      style={{
        width: "0.68em",
        height: "0.68em",
        backgroundColor,
        color: getReadableForegroundColor(textColor),
        boxShadow: "inset 0 0 0 0.055em rgba(255,255,255,0.16)"
      }}
    >
      <span className="text-[0.48em] leading-none">E</span>
    </span>
  );
}
