"use client";

import { useEffect } from "react";
import { DEFAULT_PALETTE, extractPaletteFromImage } from "@/lib/palette-extraction";
import type { ExtractedPalette } from "@/lib/types";

type PaletteInput = {
  id: string;
  coverDataUrl: string;
};

type PaletteResult = {
  id: string;
  colors: string[];
};

declare global {
  interface Window {
    extractExamplePalettes?: (items: PaletteInput[]) => Promise<PaletteResult[]>;
  }
}

export function ExamplePaletteGeneratorClient() {
  useEffect(() => {
    window.extractExamplePalettes = async (items) => {
      const results: PaletteResult[] = [];

      for (const item of items) {
        const palette = await extractPaletteFromImage(item.coverDataUrl);
        if (palette === DEFAULT_PALETTE) {
          throw new Error(`Unable to extract an album-cover palette for ${item.id}.`);
        }

        results.push({
          id: item.id,
          colors: selectGalleryColors(palette)
        });
      }

      return results;
    };

    return () => {
      delete window.extractExamplePalettes;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#05060A] p-6 text-white">
      <p className="text-sm text-white/70">Example album-cover palette generator</p>
    </main>
  );
}

function selectGalleryColors(palette: ExtractedPalette) {
  return [...new Set([
    ...palette.colors,
    palette.primary,
    palette.secondary,
    palette.accent,
    palette.muted,
    palette.dark,
    palette.light
  ].filter((color): color is string => Boolean(color)))].slice(0, 6);
}
