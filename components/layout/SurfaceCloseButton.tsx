"use client";

import { X } from "lucide-react";
import type { RefObject } from "react";

type SurfaceCloseButtonProps = {
  label: string;
  testId: string;
  onClick: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
};

export function SurfaceCloseButton({
  label,
  testId,
  onClick,
  buttonRef,
  disabled
}: SurfaceCloseButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="app-button control-focus examples-close-button inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold"
      aria-label={label}
      data-testid={testId}
    >
      <X className="examples-close-button__icon h-5 w-5" />
    </button>
  );
}
