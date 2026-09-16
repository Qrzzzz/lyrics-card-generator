import { measureAutoWidthLine } from "@/lib/auto-width-dom";
import { measureTextInkInsets } from "@/lib/text-ink-bounds";
import type {
  LandscapeLeftMeasurement,
  LandscapeLyricsMeasurement
} from "@/lib/landscape-plan";

export function measureLandscapeLayoutHost(host: HTMLElement): {
  lyricsCandidates: LandscapeLyricsMeasurement[];
  left: LandscapeLeftMeasurement;
} | null {
  const candidate = host.querySelector<HTMLElement>("[data-landscape-lyrics-candidate]");
  const metadata = host.querySelector<HTMLElement>("[data-landscape-left-metadata-measure]");
  const widths = readNumberArray(host.dataset.landscapeMeasurementWidths);
  const coverSize = readCoverSize(host.dataset.landscapeCoverSize);
  if (!candidate || !metadata || widths.length === 0 || !coverSize) return null;

  const lineElements = Array.from(candidate.querySelectorAll<HTMLElement>("[data-landscape-line]"));
  const accessories = host.querySelector<HTMLElement>("[data-landscape-left-accessories-measure]");
  const accessoriesInsets = accessories ? measureTextInkInsets(accessories) : { top: 0, bottom: 0 };
  const accessoriesHeight = accessories ? accessories.getBoundingClientRect().height - accessoriesInsets.top - accessoriesInsets.bottom : 0;
  const accessoriesWidth = accessories?.clientWidth ?? metadata.clientWidth;
  const originalAccessoriesWidth = accessories?.style.width;
  const lyricsCandidates = widths.map((lyricsWidth) => {
    candidate.style.width = `${lyricsWidth}px`;
    if (accessories) accessories.style.width = `${lyricsWidth}px`;
    const rightInsets = accessories ? measureTextInkInsets(accessories) : { top: 0, bottom: 0 };
    const ink = measureTextInkInsets(candidate);
    // Reading all line ranges after the width write gives one complete browser layout sample.
    const lines = lineElements
      .map((line) => measureAutoWidthLine(line))
      .filter((line): line is NonNullable<ReturnType<typeof measureAutoWidthLine>> => line !== null)
      .map((line) => ({
        key: line.key,
        kind: line.kind,
        visualLineCount: line.visualLineCount,
        lastLineFill: line.lastLineFill,
        averageLineFill: line.averageLineFill,
        severeOrphan: line.severeOrphan,
        horizontalOverflow: line.horizontalOverflow
      }));
    return {
      lyricsWidth,
      naturalHeight: candidate.getBoundingClientRect().height - ink.top - ink.bottom,
      inkTop: ink.top,
      inkBottom: ink.bottom,
      canDistributeRows: candidate.querySelector("[data-landscape-lyrics-content]")!.children.length > 1,
      rowCount: candidate.querySelector("[data-landscape-lyrics-content]")!.children.length,
      rightAccessoriesHeight: accessories ? accessories.getBoundingClientRect().height - rightInsets.top - rightInsets.bottom : 0,
      rightAccessoriesInkTop: rightInsets.top,
      lines
    };
  });
  if (accessories) accessories.style.width = originalAccessoriesWidth ?? "";
  return {
    lyricsCandidates,
    left: {
      coverWidth: coverSize.width,
      coverHeight: coverSize.height,
      metadataWidth: metadata.clientWidth,
      metadataHeight: Math.ceil(metadata.getBoundingClientRect().height),
      metadataInkBottom: measureTextInkInsets(metadata).bottom,
      accessoriesWidth,
      accessoriesHeight,
      accessoriesInkTop: accessoriesInsets.top
    }
  };
}

function readNumberArray(serialized?: string) {
  if (!serialized) return [];
  try {
    const value = JSON.parse(serialized) as unknown;
    return Array.isArray(value)
      ? value.filter((entry): entry is number => Number.isFinite(entry) && entry > 0)
      : [];
  } catch {
    return [];
  }
}

function readCoverSize(serialized?: string) {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as { width?: unknown; height?: unknown };
    if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return null;
    return { width: Number(value.width), height: Number(value.height) };
  } catch {
    return null;
  }
}
