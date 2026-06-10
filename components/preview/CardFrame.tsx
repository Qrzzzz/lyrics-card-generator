"use client";

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
            ? "inset-[64px] rounded-[48px] border-white/18 shadow-[0_30px_94px_rgba(0,0,0,0.34)] backdrop-blur-[28px]"
            : "inset-[72px] rounded-[48px] border-white/18 shadow-[0_36px_120px_rgba(0,0,0,0.42)] backdrop-blur-[34px]"
        )}
        style={{
          background:
            resolvedVariant === "landscapeClean"
              ? "linear-gradient(140deg, rgba(255,255,255,0.12), rgba(255,255,255,0.055) 42%, rgba(0,0,0,0.06))"
              : "rgba(255,255,255,0.105)",
          boxShadow:
            resolvedVariant === "landscapeClean"
              ? "inset 0 1px 0 rgba(255,255,255,0.22), 0 30px 94px rgba(0,0,0,0.34)"
              : "inset 0 1px 0 rgba(255,255,255,0.22), 0 36px 120px rgba(0,0,0,0.42)"
        }}
      />
      {children}
    </div>
  );
}
