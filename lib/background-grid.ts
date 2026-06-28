import type { BackgroundGridDensity } from "@/lib/types";

export const BACKGROUND_GRID_SIZE_BY_DENSITY: Record<BackgroundGridDensity, number> = {
  sparse: 72,
  medium: 56,
  dense: 40
};

export function resolveBackgroundGridDensity(density?: BackgroundGridDensity): BackgroundGridDensity {
  return density ?? "medium";
}
