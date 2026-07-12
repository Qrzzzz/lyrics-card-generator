"use client";

import { toPng } from "html-to-image";

export type ExportPngRenderOptions = {
  cacheBust: boolean;
  pixelRatio: number;
  width: number;
  height: number;
  style: Record<string, string>;
};

export type ExportImageDependencies = {
  renderNode: (node: HTMLElement, options: ExportPngRenderOptions) => Promise<string>;
  commitDownload: (dataUrl: string, fileName: string) => void;
};

const defaultDependencies: ExportImageDependencies = {
  renderNode: (node, options) => toPng(node, options),
  commitDownload: (dataUrl, fileName) => {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  }
};

export async function exportNodeAsPng(
  node: HTMLElement,
  fileName: string,
  width: number,
  height: number,
  pixelRatio = 2,
  signal?: AbortSignal,
  dependencies: ExportImageDependencies = defaultDependencies
) {
  throwIfAborted(signal);

  const dataUrl = await dependencies.renderNode(node, {
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

  // html-to-image cannot cancel an in-flight render. Never perform the
  // irreversible download if the transaction timed out while it was running.
  throwIfAborted(signal);

  dependencies.commitDownload(dataUrl, fileName);
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("The export was cancelled.", "AbortError");
}
