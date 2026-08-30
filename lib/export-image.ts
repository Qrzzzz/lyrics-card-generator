"use client";

import { toCanvas } from "html-to-image";
import {
  ExportRasterSizeLimitError,
  ExportRasterSizeMismatchError,
  getExpectedExportRasterSize,
  getExportRasterSizeIssue
} from "@/lib/export-dimensions";
import { writePngDataUrlToClipboard } from "@/lib/image-clipboard";
import { EXPORT_FORMAT_OPTIONS, type ExportFormatId } from "@/lib/settings/types";

export type ExportImageRenderOptions = {
  cacheBust: boolean;
  pixelRatio: number;
  width: number;
  height: number;
  style: Record<string, string>;
};

export type ExportImageDependencies = {
  renderNode: (
    node: HTMLElement,
    format: ExportFormatId,
    options: ExportImageRenderOptions
  ) => Promise<{ dataUrl: string; width: number; height: number }>;
  commitDownload: (dataUrl: string, fileName: string) => void;
};

export type CopyImageDependencies = {
  renderNode: ExportImageDependencies["renderNode"];
  commitClipboard: (dataUrl: string) => void | Promise<void>;
};

const defaultDependencies: ExportImageDependencies = {
  renderNode: async (node, format, options) => {
    const canvas = await toCanvas(node, options);
    const formatOption = EXPORT_FORMAT_OPTIONS.find((option) => option.id === format);
    if (!formatOption) throw new Error(`Unsupported export format: ${format}`);
    const dataUrl = canvas.toDataURL(formatOption.mimeType, format === "png" ? undefined : 0.94);
    if (format === "webp" && getDataUrlMediaType(dataUrl) !== "image/webp") {
      throw new Error("WebP export is not supported by this browser.");
    }
    return { dataUrl, width: canvas.width, height: canvas.height };
  },
  commitDownload: (dataUrl, fileName) => {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  }
};

const defaultCopyDependencies: CopyImageDependencies = {
  renderNode: defaultDependencies.renderNode,
  commitClipboard: writePngDataUrlToClipboard
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
  const dataUrl = await renderNodeAsImageData(
    node,
    format,
    width,
    height,
    pixelRatio,
    signal,
    dependencies
  );

  // html-to-image cannot cancel an in-flight render. Never perform the
  // irreversible download if the transaction timed out while it was running.
  throwIfAborted(signal);

  dependencies.commitDownload(dataUrl, fileName);
}

export async function copyNodeAsPng(
  node: HTMLElement,
  width: number,
  height: number,
  pixelRatio = 2,
  signal?: AbortSignal,
  dependencies: CopyImageDependencies = defaultCopyDependencies
) {
  const dataUrl = await renderNodeAsImageData(
    node,
    "png",
    width,
    height,
    pixelRatio,
    signal,
    dependencies
  );

  // Clipboard writes are irreversible just like downloads, so a render that
  // finishes after cancellation must never replace the user's clipboard.
  throwIfAborted(signal);
  await dependencies.commitClipboard(dataUrl);
}

async function renderNodeAsImageData(
  node: HTMLElement,
  format: ExportFormatId,
  width: number,
  height: number,
  pixelRatio: number,
  signal: AbortSignal | undefined,
  dependencies: Pick<ExportImageDependencies, "renderNode">
) {
  throwIfAborted(signal);

  const sizeIssue = getExportRasterSizeIssue(width, height, pixelRatio);
  if (sizeIssue) throw new ExportRasterSizeLimitError(sizeIssue);
  const expectedSize = getExpectedExportRasterSize(width, height, pixelRatio);

  const rendered = await dependencies.renderNode(node, format, {
    // html-to-image appends a query string when cacheBust is enabled. That is
    // valid for HTTP images but invalidates local blob: URLs completely.
    cacheBust: shouldCacheBust(node),
    pixelRatio,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: "none"
    }
  });

  if (rendered.width !== expectedSize.width || rendered.height !== expectedSize.height) {
    throw new ExportRasterSizeMismatchError(expectedSize, {
      width: rendered.width,
      height: rendered.height
    });
  }

  const formatOption = EXPORT_FORMAT_OPTIONS.find((option) => option.id === format);
  if (!formatOption || getDataUrlMediaType(rendered.dataUrl) !== formatOption.mimeType) {
    throw new Error(`The rendered image does not match the requested ${format.toUpperCase()} format.`);
  }

  throwIfAborted(signal);
  return rendered.dataUrl;
}

function getDataUrlMediaType(dataUrl: string) {
  const match = /^data:([^;,]+)(?:;[^,]*)?,/i.exec(dataUrl);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function shouldCacheBust(node: HTMLElement) {
  if (typeof node.querySelectorAll !== "function") return true;
  const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  return !images.some((image) => image.currentSrc.startsWith("blob:") || image.src.startsWith("blob:"));
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
