"use client";

import type { ExtractedPalette } from "@/lib/types";
import {
  DEFAULT_PALETTE,
  adjustLightness,
  mixColors,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  type RgbColor
} from "@/lib/palette-background";

type WeightedPixel = RgbColor & {
  weight: number;
};

type Cluster = RgbColor & {
  weight: number;
};

const SAMPLE_SIZE = 80;
const EDGE_IGNORE_RATIO = 0.07;
const CLUSTER_COUNT = 6;
const ITERATIONS = 10;

/**
 * Downsamples artwork and derives a stable, weighted palette. Decorative edge
 * pixels, transparency, near-white backgrounds, and near-black borders are
 * discounted so the result reflects the cover's visual subject.
 */
export async function extractPaletteFromImage(imageUrl: string): Promise<ExtractedPalette> {
  if (!imageUrl) {
    return DEFAULT_PALETTE;
  }

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return DEFAULT_PALETTE;
    }

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = collectWeightedPixels(data);

    if (pixels.length < 12) {
      return DEFAULT_PALETTE;
    }

    const clusters = mergeNearbyClusters(runKMeans(pixels));
    const colors = clusters.slice(0, 6).map((cluster) => rgbToHex(cluster));
    const averageLuminance = weightedAverageLuminance(pixels);
    const averageSaturation = weightedAverageSaturation(pixels);
    const hueVariance = weightedHueVariance(pixels);

    return buildPalette(colors, averageLuminance, averageSaturation, hueVariance);
  } catch (error) {
    console.warn("Palette extraction failed. Falling back to the default palette.", error);
    return DEFAULT_PALETTE;
  }
}

export { DEFAULT_PALETTE };

function collectWeightedPixels(data: Uint8ClampedArray) {
  const pixels: WeightedPixel[] = [];
  const edge = Math.round(SAMPLE_SIZE * EDGE_IGNORE_RATIO);
  const center = (SAMPLE_SIZE - 1) / 2;
  const maxDistance = Math.hypot(center, center);

  for (let y = edge; y < SAMPLE_SIZE - edge; y += 1) {
    for (let x = edge; x < SAMPLE_SIZE - edge; x += 1) {
      const index = (y * SAMPLE_SIZE + x) * 4;
      const alpha = data[index + 3] / 255;

      if (alpha < 0.2) {
        continue;
      }

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const hsl = rgbToHsl({ r, g, b });
      const luminance = relativeLuminance({ r, g, b });
      const channelSpread = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const distanceFromCenter = Math.hypot(x - center, y - center) / maxDistance;
      // Central saturated pixels usually describe the artwork better than
      // framing, whitespace, or neutral typography near the edges.
      const centerWeight = 1.12 - distanceFromCenter * 0.28;
      const saturationWeight = 0.42 + hsl.s * 1.45;
      const grayPenalty = channelSpread < 0.08 ? 0.42 : 1;
      const whitePenalty = luminance > 0.9 && hsl.s < 0.16 ? 0.25 : 1;
      const blackPenalty = luminance < 0.055 ? 0.62 : 1;

      pixels.push({
        r,
        g,
        b,
        weight: alpha * centerWeight * saturationWeight * grayPenalty * whitePenalty * blackPenalty
      });
    }
  }

  return pixels;
}

function runKMeans(pixels: WeightedPixel[]) {
  let centers = seedCenters(pixels, CLUSTER_COUNT);

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const totals = centers.map(() => ({ r: 0, g: 0, b: 0, weight: 0 }));

    for (const pixel of pixels) {
      const nearest = findNearestCenter(pixel, centers);
      totals[nearest].r += pixel.r * pixel.weight;
      totals[nearest].g += pixel.g * pixel.weight;
      totals[nearest].b += pixel.b * pixel.weight;
      totals[nearest].weight += pixel.weight;
    }

    centers = centers.map((center, index) => {
      const total = totals[index];

      if (total.weight <= 0) {
        return center;
      }

      return {
        r: total.r / total.weight,
        g: total.g / total.weight,
        b: total.b / total.weight,
        weight: total.weight
      };
    });
  }

  return centers.sort((a, b) => b.weight - a.weight);
}

function seedCenters(pixels: WeightedPixel[], count: number): Cluster[] {
  const sorted = [...pixels].sort((a, b) => b.weight - a.weight);
  const centers: Cluster[] = [];

  // Deterministic, well-separated seeds avoid palette flicker between runs.
  for (const pixel of sorted) {
    if (centers.length >= count) {
      break;
    }

    if (centers.every((center) => colorDistance(pixel, center) > 80)) {
      centers.push({ r: pixel.r, g: pixel.g, b: pixel.b, weight: pixel.weight });
    }
  }

  for (const pixel of sorted) {
    if (centers.length >= count) {
      break;
    }

    centers.push({ r: pixel.r, g: pixel.g, b: pixel.b, weight: pixel.weight });
  }

  return centers;
}

function findNearestCenter(pixel: WeightedPixel, centers: Cluster[]) {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  centers.forEach((center, index) => {
    const distance = colorDistance(pixel, center);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function colorDistance(a: RgbColor, b: RgbColor) {
  const hslA = rgbToHsl(a);
  const hslB = rgbToHsl(b);
  const hueDelta = Math.min(Math.abs(hslA.h - hslB.h), 360 - Math.abs(hslA.h - hslB.h)) / 360;
  const rgbDistance = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  const hslDistance = Math.hypot(hueDelta * 255, (hslA.s - hslB.s) * 160, (hslA.l - hslB.l) * 160);

  return rgbDistance * 0.72 + hslDistance * 0.28;
}

function mergeNearbyClusters(clusters: Cluster[]) {
  const merged: Cluster[] = [];

  for (const cluster of clusters) {
    const match = merged.find((candidate) => colorDistance(candidate, cluster) < 52);

    if (match) {
      const totalWeight = match.weight + cluster.weight;
      match.r = (match.r * match.weight + cluster.r * cluster.weight) / totalWeight;
      match.g = (match.g * match.weight + cluster.g * cluster.weight) / totalWeight;
      match.b = (match.b * match.weight + cluster.b * cluster.weight) / totalWeight;
      match.weight = totalWeight;
    } else {
      merged.push({ ...cluster });
    }
  }

  return merged.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

function buildPalette(
  colors: string[],
  averageLuminance: number,
  averageSaturation: number,
  hueVariance: number
): ExtractedPalette {
  const normalizedColors = mergeSimilarHexColors([...new Set(colors)]).slice(0, 6);

  if (normalizedColors.length === 0) {
    return DEFAULT_PALETTE;
  }

  const distinctColorCount = normalizedColors.length;
  const kind =
    averageSaturation < 0.12
      ? "neutral"
      : hueVariance < 0.018 && distinctColorCount <= 2
        ? "monochrome"
        : averageSaturation >= 0.18 && distinctColorCount >= 3
          ? "colorful"
          : "low-variance";
  const byLuminance = [...normalizedColors].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const saturated = [...normalizedColors].sort((a, b) => rgbToHsl(hexToRgbLike(b)).s - rgbToHsl(hexToRgbLike(a)).s);
  const muted = [...normalizedColors].sort((a, b) => {
    const hslA = rgbToHsl(hexToRgbLike(a));
    const hslB = rgbToHsl(hexToRgbLike(b));
    return Math.abs(hslA.s - 0.24) + Math.abs(hslA.l - 0.48) - (Math.abs(hslB.s - 0.24) + Math.abs(hslB.l - 0.48));
  });
  const primary = normalizedColors[0];
  const sourceDark = byLuminance[0] ?? primary;
  const sourceLight = byLuminance[byLuminance.length - 1] ?? primary;
  const primaryHsl = rgbToHsl(hexToRgbLike(primary));
  const dark = kind === "neutral"
    ? mixColors(sourceDark, "#050505", 0.48)
    : adjustLightness(primary, Math.min(primaryHsl.l, 0.24), kind === "colorful" ? 1 : 0.86);
  const light = kind === "neutral"
    ? mixColors(sourceLight, "#FFFFFF", 0.56)
    : adjustLightness(primary, Math.max(primaryHsl.l, 0.78), kind === "colorful" ? 0.96 : 0.7);
  const fallbackSecondary = kind === "colorful"
    ? normalizedColors[1]
    : adjustLightness(primary, Math.max(0.18, Math.min(0.42, primaryHsl.l + 0.18)), 0.9);
  const fallbackAccent = kind === "colorful"
    ? saturated[0]
    : adjustLightness(primary, Math.max(0.32, Math.min(0.62, primaryHsl.l + 0.08)), 0.76);

  return {
    colors: normalizedColors,
    primary,
    secondary: normalizedColors[1] ?? fallbackSecondary,
    accent: normalizedColors[2] ?? fallbackAccent,
    dark,
    light,
    muted: muted[0] ?? mixColors(primary, averageLuminance > 0.5 ? "#111111" : "#FFFFFF", 0.34),
    averageLuminance,
    averageSaturation,
    hueVariance,
    isLightCover: averageLuminance > 0.58,
    kind
  };
}

function weightedAverageLuminance(pixels: WeightedPixel[]) {
  let total = 0;
  let totalWeight = 0;

  for (const pixel of pixels) {
    total += relativeLuminance(pixel) * pixel.weight;
    totalWeight += pixel.weight;
  }

  return totalWeight > 0 ? total / totalWeight : DEFAULT_PALETTE.averageLuminance;
}

function weightedAverageSaturation(pixels: WeightedPixel[]) {
  let total = 0;
  let totalWeight = 0;

  for (const pixel of pixels) {
    total += rgbToHsl(pixel).s * pixel.weight;
    totalWeight += pixel.weight;
  }

  return totalWeight > 0 ? total / totalWeight : DEFAULT_PALETTE.averageSaturation;
}

function weightedHueVariance(pixels: WeightedPixel[]) {
  let x = 0;
  let y = 0;
  let totalWeight = 0;

  // Hue is circular, so variance is derived from the weighted unit-vector
  // resultant; low-saturation pixels have no meaningful hue and are skipped.
  for (const pixel of pixels) {
    const hsl = rgbToHsl(pixel);

    if (hsl.s < 0.12) {
      continue;
    }

    const weight = pixel.weight * hsl.s;
    const radians = (hsl.h * Math.PI) / 180;
    x += Math.cos(radians) * weight;
    y += Math.sin(radians) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return 1 - Math.min(1, Math.hypot(x, y) / totalWeight);
}

function mergeSimilarHexColors(colors: string[]) {
  const merged: string[] = [];

  for (const color of colors) {
    const normalized = color.toUpperCase();
    const rgb = hexToRgbLike(normalized);
    const hsl = rgbToHsl(rgb);
    const match = merged.find((candidate) => {
      const candidateRgb = hexToRgbLike(candidate);
      const candidateHsl = rgbToHsl(candidateRgb);
      const hueDelta = Math.min(Math.abs(hsl.h - candidateHsl.h), 360 - Math.abs(hsl.h - candidateHsl.h)) / 360;
      const rgbDistance = Math.hypot(rgb.r - candidateRgb.r, rgb.g - candidateRgb.g, rgb.b - candidateRgb.b);
      const hslDistance = Math.hypot(hueDelta * 220, (hsl.s - candidateHsl.s) * 150, (hsl.l - candidateHsl.l) * 150);
      return rgbDistance < 34 || hslDistance < 24;
    });

    if (!match) {
      merged.push(normalized);
    }
  }

  return merged;
}

function hexToRgbLike(hex: string): RgbColor {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load cover image for palette extraction."));
    image.src = src;
  });
}
