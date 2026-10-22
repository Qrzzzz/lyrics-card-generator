"use client";
import { useEffect, useRef, useState } from "react";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import type { UseEditorActionsInput } from "./editor-action-contracts";
import type { ExportSnapshot } from "@/lib/export-snapshot";
import { runImageOutputController, type ImageOutputFailure } from "@/lib/image-output-controller";
import { editorRecoveryCopy } from "@/lib/editor-recovery-copy";
import { ExportTransactionMutex, waitForExportSnapshotNode } from "@/lib/export-transaction";
type OutputInput = Pick<UseEditorActionsInput, "parsedState" | "cardRef" | "exportPixelRatio" | "exportFormat" | "exportBlockMessage" | "getExportBlockMessage" | "exportBusyMessage" | "exportFailedMessage" | "copyImageSuccessMessage" | "copyImageFailedMessage" | "exportImageTooLargeMessage" | "onNotify">;
export function useEditorImageOutput({ parsedState, cardRef, exportPixelRatio, exportFormat, exportBlockMessage, getExportBlockMessage, exportBusyMessage, exportFailedMessage, copyImageSuccessMessage, copyImageFailedMessage, exportImageTooLargeMessage, onNotify }: OutputInput) {
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [activeOutputAction, setActiveOutputAction] = useState<"export" | "copy" | null>(null);
  const [outputFailure, setOutputFailure] = useState<ImageOutputFailure | null>(null);
  const isCompleteExporting = activeOutputAction !== null;
  const clearVersionRef = useRef(0);
  const pendingDownloads = useRef(new Map<string, number>());
  useEffect(() => getLyricsCardDesktopApi()?.onImageDownloadResult?.(({ id, state }) => {
    const version = pendingDownloads.current.get(id);
    pendingDownloads.current.delete(id);
    if (version === undefined || version !== clearVersionRef.current) return;
    if (state === "completed") setCelebrationKey((key) => key + 1);
    else if (state === "interrupted") setOutputFailure({ action: "export", reason: "failed", message: exportFailedMessage });
  }), [exportFailedMessage]);
  const [activeExportSnapshot, setActiveExportSnapshot] = useState<ExportSnapshot | null>(null);
  const exportMutexRef = useRef(new ExportTransactionMutex());
  const exportRevisionRef = useRef(0);
  const previousExportStateRef = useRef(parsedState);
  if (previousExportStateRef.current !== parsedState) {
    previousExportStateRef.current = parsedState;
    exportRevisionRef.current += 1;
  }
  async function runImageOutput(action: "export" | "copy") {
    if (activeOutputAction !== null) return;
    setOutputFailure(null);
    const clearVersion = clearVersionRef.current;
    const desktop = getLyricsCardDesktopApi();
    const observesNativeDownload = action === "export" && !!desktop?.prepareImageDownload && !!desktop.onImageDownloadResult;
    let snapshotId: string | undefined;
    return runImageOutputController({
      action, state: parsedState, pixelRatio: exportPixelRatio,
      revision: exportRevisionRef.current, format: exportFormat, mutex: exportMutexRef.current,
      blockingMessage: () => getExportBlockMessage?.() ?? exportBlockMessage,
      validate: (snapshot) => getExportBlockMessage?.(snapshot) ?? null,
      mount: async (snapshot, signal) => {
        snapshotId = snapshot.id;
        if (observesNativeDownload) {
          if (pendingDownloads.current.size >= 64) pendingDownloads.current.delete(pendingDownloads.current.keys().next().value!);
          pendingDownloads.current.set(snapshot.id, clearVersion);
        }
        setActiveOutputAction(action);
        setActiveExportSnapshot(snapshot);
        return waitForExportSnapshotNode(() => cardRef.current, snapshot.id, signal);
      },
      unmount: () => { setActiveExportSnapshot(null); setActiveOutputAction(null); },
      loadCapture: () => import("@/lib/export-image"),
      notify: onNotify,
      onFailure: (failure) => {
        if (snapshotId) pendingDownloads.current.delete(snapshotId);
        if (clearVersion === clearVersionRef.current) setOutputFailure(failure);
      },
      messages: {
        tooLarge: exportImageTooLargeMessage, busy: exportBusyMessage,
        failed: action === "copy" ? copyImageFailedMessage : exportFailedMessage,
        success: action === "copy" ? copyImageSuccessMessage : undefined,
        timeout: editorRecoveryCopy[parsedState.locale].timeout
      },
      onSuccess: () => {
        if (!observesNativeDownload && clearVersion === clearVersionRef.current) setCelebrationKey((key) => key + 1);
      }
    });
  }

  function completeAndExport() {
    return runImageOutput("export");
  }

  function copyImageToClipboard() {
    return runImageOutput("copy");
  }


  function documentCleared() { clearVersionRef.current++; pendingDownloads.current.clear(); setCelebrationKey(0); setOutputFailure(null); }
  function documentReplaced() { clearVersionRef.current++; pendingDownloads.current.clear(); setOutputFailure(null); }
  function retryOutput() { if (outputFailure) return runImageOutput(outputFailure.action); }
  return { celebrationKey, activeOutputAction, isCompleteExporting, activeExportSnapshot, completeAndExport, copyImageToClipboard, documentCleared, documentReplaced, outputFailure, retryOutput };
}
