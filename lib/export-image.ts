"use client";

import { toPng } from "html-to-image";

export async function exportNodeAsPng(
  node: HTMLElement,
  fileName: string,
  width: number,
  height: number,
  pixelRatio = 2
) {
  if ("fonts" in document) {
    await document.fonts.ready;
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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

  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}
