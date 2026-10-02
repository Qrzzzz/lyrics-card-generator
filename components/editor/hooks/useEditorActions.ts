"use client";
import { useEditorDocumentCommands } from "./useEditorDocumentCommands";
import { useEditorImageOutput } from "./useEditorImageOutput";
import type { UseEditorActionsInput } from "./editor-action-contracts";
export type { UseEditorActionsInput } from "./editor-action-contracts";
export type { SongLinkAutoParseVisitIntent } from "./useEditorDocumentCommands";

/** Composition only: document commands, draft/history ports and output keep one lifecycle. */
export function useEditorActions(input: UseEditorActionsInput) {
  const output = useEditorImageOutput(input);
  const commands = useEditorDocumentCommands({ ...input,
    documentCleared: output.documentCleared, documentReplaced: output.documentReplaced
  });
  return { ...commands,
    celebrationKey: output.celebrationKey,
    activeOutputAction: output.activeOutputAction,
    isCompleteExporting: output.isCompleteExporting,
    activeExportSnapshot: output.activeExportSnapshot,
    completeAndExport: output.completeAndExport,
    copyImageToClipboard: output.copyImageToClipboard
  };
}
