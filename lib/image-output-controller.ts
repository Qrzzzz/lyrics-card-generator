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
  messages: { tooLarge: string; busy: string; failed: string; success?: string };
  onSuccess?: () => void;
  timeoutMs?: number;
}) {
  const { action, messages, notify } = options;
  const blocked = options.blockingMessage();
  if (blocked) { notify(blocked, "warning"); return; }
  const rasterIssue = action === "copy" ? getClipboardRasterSizeIssue : getExportRasterSizeIssue;
  const isTooLarge = (snapshot: ExportSnapshot) => rasterIssue(snapshot.width, snapshot.height, snapshot.pixelRatio);
  try {
    const snapshot = createExportSnapshot(options.state, options.pixelRatio, options.revision, action === "copy" ? "png" : options.format);
    if (isTooLarge(snapshot)) { notify(messages.tooLarge, "warning"); return; }
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
    else if (result.kind === "blocked") notify(result.reason, "warning");
    else if (action === "copy" && result.error instanceof Error && result.error.name === "ImageClipboardSizeLimitError") notify(messages.tooLarge, "warning");
    else {
      console.error(`[Lyrics Card Generator] ${action} image output failed`, result.error);
      notify(messages.failed, "error");
    }
  } catch (error) {
    console.error(`[Lyrics Card Generator] ${action} image output failed`, error);
    notify(messages.failed, "error");
  }
}
