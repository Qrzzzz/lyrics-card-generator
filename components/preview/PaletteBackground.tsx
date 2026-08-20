"use client";

import { useMemo } from "react";
import { BACKGROUND_GRID_SIZE_BY_DENSITY, resolveBackgroundGridDensity } from "@/lib/background-grid";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import {
  createColorFieldMesh,
  createColorFieldPlan,
  type SpatialPaletteContract
} from "@/lib/spatial-color-field";
import type { BackgroundGridDensity, ExtractedPalette } from "@/lib/types";

export function PaletteBackground({
  palette,
  width = 1080,
  height = 1350,
  spatialPalette,
  showFineGrid = false,
  fineGridDensity
}: {
  palette?: ExtractedPalette;
  width?: number;
  height?: number;
  spatialPalette?: SpatialPaletteContract;
  showFineGrid?: boolean;
  fineGridDensity?: BackgroundGridDensity;
}) {
  const activePalette = palette ?? DEFAULT_PALETTE;
  const gridSize = BACKGROUND_GRID_SIZE_BY_DENSITY[resolveBackgroundGridDensity(fineGridDensity)];
  const { plan, mesh } = useMemo(() => {
    const nextPlan = createColorFieldPlan({ width, height, palette: activePalette, spatialPalette });
    return { plan: nextPlan, mesh: createColorFieldMesh(nextPlan) };
  }, [activePalette, height, spatialPalette, width]);
  const filterId = `palette-field-soften-${plan.seed.toString(16)}`;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-palette-field={plan.topology}
      data-palette-field-seed={plan.seed}
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${mesh.viewWidth} ${mesh.viewHeight}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        <rect width={mesh.viewWidth} height={mesh.viewHeight} fill={plan.baseColor} />
        <defs>
          <filter
            id={filterId}
            x={-mesh.cellSize * 2}
            y={-mesh.cellSize * 2}
            width={mesh.viewWidth + mesh.cellSize * 4}
            height={mesh.viewHeight + mesh.cellSize * 4}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={mesh.blur} edgeMode="duplicate" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>
          {mesh.cells.map((cell) => (
            <rect
              key={cell.key}
              x={cell.x}
              y={cell.y}
              width={cell.width}
              height={cell.height}
              fill={cell.color}
            />
          ))}
        </g>
      </svg>
      {showFineGrid ? (
        <div
          data-card-fine-grid="true"
          className="absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.34) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.34) 1px, transparent 1px)",
            backgroundSize: `${gridSize}px ${gridSize}px`
          }}
        />
      ) : null}
    </div>
  );
}
