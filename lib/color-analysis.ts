"use client";

import type { BackgroundAnalysis, TextColorPreset } from "@/lib/types";
import { relativeLuminance } from "@/lib/palette-background";

export const TEXT_COLOR_PRESETS: Record<TextColorPreset, { label: string; value: string }> = {
  white: { label: "Pure white", value: "#FFFFFF" },
  black: { label: "Pure black", value: "#111111" },
  warmWhite: { label: "Warm white", value: "#F8F4EA" },
  cream: { label: "Cream", value: "#FFF2D8" },
  charcoal: { label: "Charcoal", value: "#1D1D1F" },
  softBlue: { label: "Soft blue gray", value: "#DDE8F2" },
  softGold: { label: "Soft gold", value: "#F1DCA7" }
};

export const DEFAULT_BACKGROUND_ANALYSIS: BackgroundAnalysis = {
  luminance: 0.09,
  isLight: false,
  suggestedTextColor: "#FFFFFF",
  overlayOpacity: 0.48
};

export function getReadableTextColorFromLuminance(luminance: number) {
  if (luminance > 0.34) {
    return "#111111";
  }

  if (luminance > 0.2) {
    return "#F8F4EA";
  }

  return "#FFFFFF";
}

export function getOverlayOpacityFromLuminance(luminance: number) {
  if (luminance > 0.34) {
    return 0.24;
  }

  if (luminance > 0.2) {
    return 0.42;
  }

  return 0.52;
}

export async function analyzeImageLuminance(imageUrl: string): Promise<BackgroundAnalysis> {
  if (!imageUrl) {
    return DEFAULT_BACKGROUND_ANALYSIS;
  }

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return DEFAULT_BACKGROUND_ANALYSIS;
    }

    // A small uniform sample is sufficient for the coarse overlay/text choice
    // and keeps repeated cover changes inexpensive.
    context.drawImage(image, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32);
    let total = 0;
    let totalAlpha = 0;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      if (alpha < 0.2) {
        continue;
      }

      total += relativeLuminance({ r: data[index], g: data[index + 1], b: data[index + 2] }) * alpha;
      totalAlpha += alpha;
    }

    const luminance = totalAlpha > 0 ? total / totalAlpha : DEFAULT_BACKGROUND_ANALYSIS.luminance;

    return {
      luminance,
      isLight: luminance > 0.34,
      suggestedTextColor: getReadableTextColorFromLuminance(luminance),
      overlayOpacity: getOverlayOpacityFromLuminance(luminance)
    };
  } catch {
    return DEFAULT_BACKGROUND_ANALYSIS;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to analyze cover image."));
    image.src = src;
  });
}
