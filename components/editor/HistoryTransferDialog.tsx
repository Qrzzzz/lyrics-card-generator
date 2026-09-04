"use client";

import { useEffect, useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { ActionButton, TextareaField } from "@/components/ui/controls";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { historyTransferCopy, historyTransferError } from "@/lib/history-transfer-copy";
import { formatImportHistoryText } from "@/lib/import-history-copy";
import { MAX_HISTORY_TRANSFER_CHARACTERS, type HistoryTransferPreview } from "@/lib/import-history";
import type { Locale } from "@/lib/types";

export function HistoryTransferDialog({ open, locale, onClose, onBeforeTransfer, onImported }: {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onBeforeTransfer: () => Promise<void>;
  onImported: (result: HistoryTransferPreview) => void;
}) {
  const copy = historyTransferCopy[locale];
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<HistoryTransferPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setJson(""); setPreview(null); setError(""); }
  }, [open]);
  useEffect(() => {
    if (!open || busy) return;
    const dialog = document.querySelector('[data-testid="history-transfer-dialog"]');
    // Disabling the focused submit button during IPC can move focus to body.
    // Restore it inside the modal when the operation settles, including errors.
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    }
  }, [busy, open]);

  async function run(confirm: boolean) {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop || busy) return;
    setBusy(true);
    setError("");
    try {
      await onBeforeTransfer();
      const result = confirm && preview
        ? await desktop.importRemoteHistory(json, preview.version)
        : await desktop.previewRemoteHistory(json);
      if (!result.ok) {
        setPreview(null);
        setError(historyTransferError(locale, result.code));
      } else if (confirm) {
        onImported(result.data);
      } else {
        setPreview(result.data);
      }
    } catch {
      setError(copy.failed);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessibleDialog open={open} labelledBy="history-transfer-title" describedBy="history-transfer-intro" inheritThemeFrom=".app-shell"
      onClose={() => { if (!busy) onClose(); }} escapeCloses={!busy} closeOnBackdrop={!busy}
      initialFocusSelector='[data-testid="history-json-input"]' returnFocusSelector='[data-testid="history-paste"]'
      testId="history-transfer-dialog" panelClassName="settings-panel-card !bg-[rgb(var(--elevated-panel-bg))] max-h-[85dvh] max-w-2xl overflow-y-auto rounded-2xl p-5 shadow-2xl">
      <h2 id="history-transfer-title" className="app-text-primary text-lg font-bold">{copy.title}</h2>
      <p id="history-transfer-intro" className="app-text-muted mt-2 text-sm leading-relaxed">{copy.intro}</p>
      <label className="mt-4 block">
        <span className="app-text-muted mb-2 block text-sm">{copy.input}</span>
        <TextareaField data-testid="history-json-input" value={json} disabled={busy} spellCheck={false}
          className="min-h-48 max-h-80 font-mono text-xs" rows={8}
          onPaste={(event) => {
            if (event.clipboardData.getData("text").length > MAX_HISTORY_TRANSFER_CHARACTERS) {
              event.preventDefault(); setError(copy.tooLarge); setPreview(null);
            }
          }}
          onChange={(event) => {
            setPreview(null);
            if (event.target.value.length > MAX_HISTORY_TRANSFER_CHARACTERS) { setError(copy.tooLarge); return; }
            setJson(event.target.value); setError("");
          }} />
      </label>
      {error ? <p role="alert" className="status-danger mt-3 rounded-lg border p-3 text-sm">{error}</p> : null}
      {preview ? <div className="mt-3 space-y-2" aria-live="polite" data-testid="history-import-preview">
        <p className="app-text-primary text-sm">{formatImportHistoryText(copy.summary, preview)}</p>
        {preview.trimmed > 0 ? <p className="status-warning rounded-lg border p-3 text-sm">
          {formatImportHistoryText(copy.trim, preview)}
        </p> : null}
      </div> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <ActionButton disabled={busy} onClick={onClose}>{copy.cancel}</ActionButton>
        <ActionButton data-testid="history-import-preview-button" disabled={busy || !json.trim()} loading={busy && !preview}
          onClick={() => void run(false)}>{copy.preview}</ActionButton>
        {preview ? <ActionButton data-testid="history-import-confirm" variant={preview.trimmed ? "danger" : "primary"}
          loading={busy} disabled={busy || (preview.added === 0 && preview.trimmed > 0)}
          onClick={() => void run(true)}>{copy.confirm}</ActionButton> : null}
      </div>
    </AccessibleDialog>
  );
}
