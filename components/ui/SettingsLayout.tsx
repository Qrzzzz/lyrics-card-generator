"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Shared by settings content only. Navigation, editors and result lists keep their own layout. */
export function SettingsLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("editor-settings-layout settings-content-layout", className)} />;
}

/** Intrinsic 1–3 columns, based on available content width rather than the window. */
export function SettingsGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("editor-settings-grid", className)} />;
}
