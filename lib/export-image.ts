"use client";

import { toPng } from "html-to-image";

export async function exportNodeAsPng(
  node: HTMLElement,
  fileName: string,
  width: number,
  height: number,
  pixelRatio = 2,
  signal?: AbortSignal
) {
  throwIfAborted(signal);

  const dataUrl = await toPng(node, {
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

  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("The export was cancelled.", "AbortError");
}
