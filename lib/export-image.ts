"use client";

import { toCanvas, toJpeg, toPng } from "html-to-image";
import { EXPORT_FORMAT_OPTIONS, type ExportFormatId } from "@/lib/settings/types";

export type ExportImageRenderOptions = {
  cacheBust: boolean;
  pixelRatio: number;
  width: number;
  height: number;
  style: Record<string, string>;
};

export type ExportImageDependencies = {
  renderNode: (node: HTMLElement, format: ExportFormatId, options: ExportImageRenderOptions) => Promise<string>;
  commitDownload: (dataUrl: string, fileName: string) => void;
};

const defaultDependencies: ExportImageDependencies = {
  renderNode: async (node, format, options) => {
    if (format === "png") return toPng(node, options);
    if (format === "jpg") return toJpeg(node, { ...options, quality: 0.94 });

    const canvas = await toCanvas(node, options);
    const dataUrl = canvas.toDataURL("image/webp", 0.94);
    if (!dataUrl.startsWith("data:image/webp")) {
      throw new Error("WebP export is not supported by this browser.");
    }
    return dataUrl;
  },
  commitDownload: (dataUrl, fileName) => {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  }
};

export async function exportNodeAsImage(
  node: HTMLElement,
  fileName: string,
  format: ExportFormatId,
  width: number,
  height: number,
  pixelRatio = 2,
  signal?: AbortSignal,
  dependencies: ExportImageDependencies = defaultDependencies
) {
  throwIfAborted(signal);

  const dataUrl = await dependencies.renderNode(node, format, {
    cacheBust: true,
    pixelRatio,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: "none"
    }
  });

  const formatOption = EXPORT_FORMAT_OPTIONS.find((option) => option.id === format);
  if (!formatOption || !dataUrl.startsWith(`data:${formatOption.mimeType}`)) {
    throw new Error(`The rendered image does not match the requested ${format.toUpperCase()} format.`);
  }

  // html-to-image cannot cancel an in-flight render. Never perform the
  // irreversible download if the transaction timed out while it was running.
  throwIfAborted(signal);

  dependencies.commitDownload(dataUrl, fileName);
}

export function exportNodeAsPng(
  node: HTMLElement,
  fileName: string,
  width: number,
  height: number,
  pixelRatio = 2,
  signal?: AbortSignal,
  dependencies: ExportImageDependencies = defaultDependencies
) {
  return exportNodeAsImage(node, fileName, "png", width, height, pixelRatio, signal, dependencies);
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("The export was cancelled.", "AbortError");
}
