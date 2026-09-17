import { PaletteBackground } from "./PaletteBackground";
import { resolveSolidColor } from "@/lib/solid-background";
import type { CardStyle } from "@/lib/types";

export function CardBackground({ style, width, height }: { style: CardStyle; width: number; height: number }) {
  if (style.backgroundMode === "solid") return <div aria-hidden="true" data-solid-background className="absolute inset-0" style={{ backgroundColor: resolveSolidColor(style) }} />;
  return <PaletteBackground palette={style.extractedPalette} width={width} height={height} showFineGrid={style.showFineGrid} fineGridDensity={style.fineGridDensity} />;
}
