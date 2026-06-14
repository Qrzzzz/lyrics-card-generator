"use client";

import { LANDSCAPE_FRAME_INSET, PORTRAIT_FRAME_INSET } from "@/lib/frame-layout";
import type { CardLayoutMode, FrameVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CardFrame({
  layoutMode,
  enabled,
  variant = "auto",
  children
}: {
  layoutMode: CardLayoutMode;
  enabled: boolean;
  variant?: FrameVariant;
  children: React.ReactNode;
}) {
  const resolvedVariant = variant === "auto" ? (layoutMode === "landscape" ? "landscapeClean" : "portraitGlass") : variant;

  if (!enabled || resolvedVariant === "fullBleed") {
    return <>{children}</>;
  }

  return (
    <div className="absolute inset-0">
      <div
        className={cn(
          "pointer-events-none absolute border",
          resolvedVariant === "landscapeClean"
            ? "rounded-[48px] border-white/16 shadow-[0_24px_78px_rgba(0,0,0,0.22)]"
            : "rounded-[48px] border-white/18 shadow-[0_36px_120px_rgba(0,0,0,0.42)] backdrop-blur-[34px]"
        )}
        style={{
          inset: resolvedVariant === "landscapeClean" ? LANDSCAPE_FRAME_INSET : PORTRAIT_FRAME_INSET,
          background:
            resolvedVariant === "landscapeClean"
              ? "linear-gradient(140deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 42%, rgba(0,0,0,0.05))"
              : "rgba(255,255,255,0.105)",
          boxShadow:
            resolvedVariant === "landscapeClean"
              ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 24px 78px rgba(0,0,0,0.22)"
              : "inset 0 1px 0 rgba(255,255,255,0.22), 0 36px 120px rgba(0,0,0,0.42)"
        }}
      />
      {children}
    </div>
  );
}
