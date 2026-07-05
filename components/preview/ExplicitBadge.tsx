"use client";

import { withAlpha } from "@/lib/palette-background";

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

  return (
    <span
      aria-label="Explicit"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-[0.18em] align-middle font-mono font-black leading-none ${className}`}
      style={{
        width: "0.86em",
        height: "0.86em",
        fontSize: "0.82em",
        backgroundColor: withAlpha(textColor, 0.6),
        color: "#FFFFFF"
      }}
    >
      E
    </span>
  );
}
