"use client";

import type { BackgroundAnalysis, TextColorPreset } from "@/lib/types";

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
  luminance: 0.32,
  isLight: false,
  suggestedTextColor: "#FFFFFF",
  overlayOpacity: 0.48
};

export function getReadableTextColorFromLuminance(luminance: number) {
  if (luminance > 0.62) {
    return "#111111";
  }

  if (luminance > 0.48) {
    return "#F8F4EA";
  }

  return "#FFFFFF";
}

export function getOverlayOpacityFromLuminance(luminance: number) {
  if (luminance > 0.62) {
    return 0.24;
  }

  if (luminance > 0.48) {
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

    context.drawImage(image, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32);
    let total = 0;
    let count = 0;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      if (alpha < 0.2) {
        continue;
      }

      const luminance =
        (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
      total += luminance;
      count += 1;
    }

    const luminance = count > 0 ? total / count : DEFAULT_BACKGROUND_ANALYSIS.luminance;

    return {
      luminance,
      isLight: luminance > 0.62,
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
