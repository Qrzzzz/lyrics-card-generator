"use client";

import { ActionButton } from "@/components/ui/controls";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

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
  return (
    <AccessibleDialog open={open} role="alertdialog" labelledBy="settings-confirm-title" describedBy="settings-confirm-description" onClose={onCancel} initialFocusSelector='[data-testid="settings-confirm-cancel"]' testId="settings-confirm-overlay" panelClassName="settings-panel-card max-w-md rounded-2xl p-5 shadow-2xl">
      <div>
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
    </AccessibleDialog>
  );
}
