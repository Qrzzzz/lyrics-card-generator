"use client";
import { useRef, useState } from "react";
import type { UseEditorActionsInput } from "./editor-action-contracts";
import type { ExportSnapshot } from "@/lib/export-snapshot";
import { runImageOutputController } from "@/lib/image-output-controller";
import { ExportTransactionMutex, waitForExportSnapshotNode } from "@/lib/export-transaction";
type OutputInput = Pick<UseEditorActionsInput, "parsedState" | "cardRef" | "exportPixelRatio" | "exportFormat" | "exportBlockMessage" | "getExportBlockMessage" | "exportBusyMessage" | "exportFailedMessage" | "copyImageSuccessMessage" | "copyImageFailedMessage" | "exportImageTooLargeMessage" | "onNotify">;
export function useEditorImageOutput({ parsedState, cardRef, exportPixelRatio, exportFormat, exportBlockMessage, getExportBlockMessage, exportBusyMessage, exportFailedMessage, copyImageSuccessMessage, copyImageFailedMessage, exportImageTooLargeMessage, onNotify }: OutputInput) {
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [activeOutputAction, setActiveOutputAction] = useState<"export" | "copy" | null>(null);
  const isCompleteExporting = activeOutputAction !== null;
  const clearVersionRef = useRef(0);
  const [activeExportSnapshot, setActiveExportSnapshot] = useState<ExportSnapshot | null>(null);
  const exportMutexRef = useRef(new ExportTransactionMutex());
  const exportRevisionRef = useRef(0);
  const previousExportStateRef = useRef(parsedState);
  if (previousExportStateRef.current !== parsedState) {
    previousExportStateRef.current = parsedState;
    exportRevisionRef.current += 1;
  }
  async function runImageOutput(action: "export" | "copy") {
    const clearVersion = clearVersionRef.current;
    return runImageOutputController({
      action, state: parsedState, pixelRatio: exportPixelRatio,
      revision: exportRevisionRef.current, format: exportFormat, mutex: exportMutexRef.current,
      blockingMessage: () => getExportBlockMessage?.() ?? exportBlockMessage,
      validate: (snapshot) => getExportBlockMessage?.(snapshot) ?? null,
      mount: async (snapshot, signal) => {
        setActiveOutputAction(action);
        setActiveExportSnapshot(snapshot);
        return waitForExportSnapshotNode(() => cardRef.current, snapshot.id, signal);
      },
      unmount: () => { setActiveExportSnapshot(null); setActiveOutputAction(null); },
      loadCapture: () => import("@/lib/export-image"),
      notify: onNotify,
      messages: {
        tooLarge: exportImageTooLargeMessage, busy: exportBusyMessage,
        failed: action === "copy" ? copyImageFailedMessage : exportFailedMessage,
        success: action === "copy" ? copyImageSuccessMessage : undefined
      },
      onSuccess: () => {
        if (clearVersion === clearVersionRef.current) setCelebrationKey((key) => key + 1);
      }
    });
  }

  function completeAndExport() {
    return runImageOutput("export");
  }

  function copyImageToClipboard() {
    return runImageOutput("copy");
  }


  function documentCleared() { clearVersionRef.current++; setCelebrationKey(0); }
  function documentReplaced() { clearVersionRef.current++; }
  return { celebrationKey, activeOutputAction, isCompleteExporting, activeExportSnapshot, completeAndExport, copyImageToClipboard, documentCleared, documentReplaced };
}
