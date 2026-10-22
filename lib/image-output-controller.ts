import { createExportSnapshot, type ExportSnapshot } from "@/lib/export-snapshot";
import { getClipboardRasterSizeIssue, getExportRasterSizeIssue } from "@/lib/export-dimensions";
import { runExportTransaction, type ExportTransactionMutex } from "@/lib/export-transaction";
import type { AppState } from "@/lib/types";
import type { ExportFormatId } from "@/lib/settings/types";
import type { copyNodeAsPng, exportNodeAsImage } from "@/lib/export-image";

type CaptureAdapter = {
  copyNodeAsPng: typeof copyNodeAsPng;
  exportNodeAsImage: typeof exportNodeAsImage;
};

export type ImageOutputFailure = {
  action: "export" | "copy";
  reason: "blocked" | "size" | "timeout" | "failed";
  message: string;
};

/** Shared output lifecycle; platforms own host readiness and resource leases. */
export async function runImageOutputController(options: {
  action: "export" | "copy";
  state: AppState;
  pixelRatio: number;
  revision: number;
  format: ExportFormatId;
  mutex: ExportTransactionMutex;
  blockingMessage: () => string | null | undefined;
  validate: (snapshot: ExportSnapshot) => string | null;
  mount: (snapshot: ExportSnapshot, signal: AbortSignal) => Promise<HTMLElement>;
  unmount: () => void;
  loadCapture: () => Promise<CaptureAdapter>;
  notify: (message: string, kind: "success" | "warning" | "error") => void;
  messages: { tooLarge: string; busy: string; failed: string; success?: string; timeout?: string };
  onFailure?: (failure: ImageOutputFailure) => void;
  onSuccess?: () => void;
  timeoutMs?: number;
}) {
  const { action, messages, notify } = options;
  const fail = (message: string, reason: ImageOutputFailure["reason"], tone: "warning" | "error" = "error") => {
    if (options.onFailure) options.onFailure({ action, reason, message });
    else notify(message, tone);
  };
  const failError = (error: unknown) => {
    const timedOut = error instanceof Error && error.name === "ExportTransactionTimeoutError";
    fail(timedOut ? messages.timeout ?? messages.failed : messages.failed, timedOut ? "timeout" : "failed");
  };
  const blocked = options.blockingMessage();
  if (blocked) { fail(blocked, "blocked", "warning"); return; }
  const rasterIssue = action === "copy" ? getClipboardRasterSizeIssue : getExportRasterSizeIssue;
  const isTooLarge = (snapshot: ExportSnapshot) => rasterIssue(snapshot.width, snapshot.height, snapshot.pixelRatio);
  try {
    const snapshot = createExportSnapshot(options.state, options.pixelRatio, options.revision, action === "copy" ? "png" : options.format);
    if (isTooLarge(snapshot)) { fail(messages.tooLarge, "size", "warning"); return; }
    const result = await runExportTransaction({
      mutex: options.mutex,
      snapshot,
      timeoutMs: options.timeoutMs,
      mountSnapshot: options.mount,
      unmountSnapshot: options.unmount,
      validateSnapshot: (mounted) => isTooLarge(mounted) ? messages.tooLarge : options.validate(mounted),
      captureSnapshot: async (mounted, node, signal) => {
        const capture = await options.loadCapture();
        if (signal.aborted) throw signal.reason;
        return action === "copy"
          ? capture.copyNodeAsPng(node, mounted.width, mounted.height, mounted.pixelRatio, signal)
          : capture.exportNodeAsImage(node, mounted.fileName, mounted.format, mounted.width, mounted.height, mounted.pixelRatio, signal);
      }
    });
    if (result.ok) {
      options.onSuccess?.();
      if (messages.success) notify(messages.success, "success");
    } else if (result.kind === "busy") notify(messages.busy, "warning");
    else if (result.kind === "blocked") fail(result.reason, "blocked", "warning");
    else if (action === "copy" && result.error instanceof Error && result.error.name === "ImageClipboardSizeLimitError") fail(messages.tooLarge, "size", "warning");
    else {
      console.error(`[Lyrics Card Generator] ${action} image output failed`, result.error);
      failError(result.error);
    }
  } catch (error) {
    console.error(`[Lyrics Card Generator] ${action} image output failed`, error);
    failError(error);
  }
}
