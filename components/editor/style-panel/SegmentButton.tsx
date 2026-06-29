"use client";

import { cn } from "@/lib/utils";

type SegmentButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
  dataAttribute: string;
  disabled?: boolean;
  title?: string;
};

export function SegmentButton({ active, label, onClick, dataAttribute, disabled = false, title }: SegmentButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-selected={active ? "true" : "false"}
      disabled={disabled}
      title={title}
      data-segment-value={dataAttribute}
      onClick={onClick}
      className={cn(
        "segmented-control__item control-focus control-disabled h-11 rounded-lg px-3 text-sm font-semibold",
        active ? "text-[rgb(var(--app-fg))]" : "app-text-subtle"
      )}
    >
      {label}
    </button>
  );
}
