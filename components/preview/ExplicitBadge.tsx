"use client";

import { useId } from "react";

export function ExplicitBadge({
  show,
  textColor,
  className = ""
}: {
  show?: boolean;
  textColor: string;
  className?: string;
}) {
  const generatedMaskId = useId();

  if (!show) {
    return null;
  }

  const maskId = `explicit-badge-${generatedMaskId.replace(/:/g, "")}`;

  return (
    <span
      aria-label="Explicit"
      role="img"
      className={`inline-flex shrink-0 select-none items-center justify-center align-middle ${className}`}
      style={{
        width: "0.62em",
        height: "0.62em",
        color: textColor,
        opacity: 0.6,
        transform: "translateY(0.045em)"
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="2" y="2" width="28" height="28" rx="6.6" fill="white" />
            <path
              d="M11.25 9.75 V22.25 M11.25 9.75 H21.15 M11.25 16 H19.75 M11.25 22.25 H21.15"
              fill="none"
              stroke="black"
              strokeWidth="3.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="6.6" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
    </span>
  );
}
