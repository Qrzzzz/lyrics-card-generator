"use client";

import { useEffect } from "react";
import { ActionButton } from "@/components/ui/controls";

export function SettingsConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmTestId,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmTestId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="settings-confirm-cancel"]')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      data-testid="settings-confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-confirm-title"
        aria-describedby="settings-confirm-description"
        className="settings-panel-card w-full max-w-md rounded-2xl p-5 shadow-2xl"
      >
        <h3 id="settings-confirm-title" className="app-text-primary text-lg font-bold">{title}</h3>
        <p id="settings-confirm-description" className="app-text-muted mt-2 text-sm leading-relaxed">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <ActionButton onClick={onCancel} data-testid="settings-confirm-cancel">
            {cancelLabel}
          </ActionButton>
          <ActionButton variant="danger" onClick={onConfirm} data-testid={confirmTestId}>
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
