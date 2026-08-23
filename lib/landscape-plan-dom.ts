import { measureAutoWidthLine } from "@/lib/auto-width-dom";
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
  const lyricsCandidates = widths.map((lyricsWidth) => {
    candidate.style.width = `${lyricsWidth}px`;
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
      naturalHeight: Math.ceil(candidate.getBoundingClientRect().height),
      lines
    };
  });
  const accessories = host.querySelector<HTMLElement>("[data-landscape-left-accessories-measure]");

  return {
    lyricsCandidates,
    left: {
      coverWidth: coverSize.width,
      coverHeight: coverSize.height,
      metadataWidth: metadata.clientWidth,
      metadataHeight: Math.ceil(metadata.getBoundingClientRect().height),
      accessoriesWidth: accessories?.clientWidth ?? metadata.clientWidth,
      accessoriesHeight: accessories ? Math.ceil(accessories.getBoundingClientRect().height) : 0
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
