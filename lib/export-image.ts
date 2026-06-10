"use client";

import { toPng } from "html-to-image";

export async function exportNodeAsPng(
  node: HTMLElement,
  fileName: string,
  width: number,
  height: number
) {
  if ("fonts" in document) {
    await document.fonts.ready;
  }

  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: "none"
    }
  });

  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}
