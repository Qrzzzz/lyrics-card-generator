"use client";

import { getLyricsCardDesktopApi } from "@/lib/desktop-api";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

export class ImageClipboardUnavailableError extends Error {
  constructor(message = "Image clipboard access is unavailable.") {
    super(message);
    this.name = "ImageClipboardUnavailableError";
  }
}

export async function writePngDataUrlToClipboard(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX) || dataUrl.length <= PNG_DATA_URL_PREFIX.length) {
    throw new TypeError("The clipboard image must be a PNG data URL.");
  }

  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    if (!await desktop.copyImageToClipboard(dataUrl)) {
      throw new ImageClipboardUnavailableError();
    }
    return;
  }

  if (
    typeof navigator === "undefined" ||
    typeof navigator.clipboard?.write !== "function" ||
    typeof ClipboardItem === "undefined" ||
    (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports("image/png"))
  ) {
    throw new ImageClipboardUnavailableError();
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.type !== "image/png") {
    throw new TypeError("The clipboard image payload is not PNG data.");
  }

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob })
  ]);
}
