"use client";

import { cn } from "@/lib/utils";

type SegmentButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
  dataAttribute: string;
};

export function SegmentButton({ active, label, onClick, dataAttribute }: SegmentButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-segment-value={dataAttribute}
      onClick={onClick}
      className={cn(
        "app-button h-11 rounded-lg px-3 text-sm font-semibold transition",
        active ? "bg-[rgb(var(--button-bg-hover))] text-[rgb(var(--app-fg))]" : "app-text-subtle"
      )}
    >
      {label}
    </button>
  );
}
