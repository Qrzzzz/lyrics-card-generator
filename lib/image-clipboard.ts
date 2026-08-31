"use client";

import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import resourceBudgets from "@/electron/resource-budgets.json";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

export class ImageClipboardUnavailableError extends Error {
  constructor(message = "Image clipboard access is unavailable.") {
    super(message);
    this.name = "ImageClipboardUnavailableError";
  }
}

export class ImageClipboardSizeLimitError extends Error {
  constructor() {
    super("The PNG is too large for the clipboard; lower the export quality or shorten the content.");
    this.name = "ImageClipboardSizeLimitError";
  }
}

export async function writePngDataUrlToClipboard(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX) || dataUrl.length <= PNG_DATA_URL_PREFIX.length) {
    throw new TypeError("The clipboard image must be a PNG data URL.");
  }
  if (getPngDataUrlEncodedByteLength(dataUrl) > resourceBudgets.clipboardImage.encodedBytes) {
    throw new ImageClipboardSizeLimitError();
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

export function getPngDataUrlEncodedByteLength(dataUrl: string) {
  const payloadLength = dataUrl.length - PNG_DATA_URL_PREFIX.length;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return payloadLength > 0 && payloadLength % 4 === 0
    ? (payloadLength / 4) * 3 - padding
    : Number.POSITIVE_INFINITY;
}
