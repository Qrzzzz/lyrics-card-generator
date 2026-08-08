import type {
  AutoWidthCandidateMetrics,
  AutoWidthLineKind,
  AutoWidthLineMetrics
} from "@/lib/auto-width";

type TextUnit = {
  start: number;
  end: number;
  kind: "cjk" | "word";
  text: string;
};

type RectFragment = {
  top: number;
  left: number;
  right: number;
};

type UnitSpanFragment = RectFragment & {
  firstUnit: number;
  lastUnit: number;
};

type AutoWidthMeasurementTarget = {
  canvasWidth: number;
  contentWidth: number;
};

export function measureAutoWidthCandidates(host: HTMLElement): AutoWidthCandidateMetrics[] {
  const candidate = host.querySelector<HTMLElement>("[data-auto-width-candidate]");
  const targets = readMeasurementTargets(host);
  if (!candidate || targets.length === 0) return [];

  const lineElements = Array.from(candidate.querySelectorAll<HTMLElement>("[data-auto-width-line]"));
  const unitCache = new Map<string, TextUnit[]>();
  return targets.map(({ canvasWidth, contentWidth }) => {
    // Reusing this one lyric tree removes 36 complete React subtrees. The first
    // geometry read below synchronously lays out only this candidate width.
    candidate.dataset.autoWidthCandidate = String(canvasWidth);
    candidate.style.width = `${contentWidth}px`;

    return {
      canvasWidth,
      lines: lineElements
        .map((line) => {
          const textNode = findTextNode(line);
          const text = textNode?.data ?? line.textContent ?? "";
          let units = unitCache.get(text);
          if (!units) {
            units = segmentTextUnits(text);
            unitCache.set(text, units);
          }
          return measureAutoWidthLine(line, units);
        })
        .filter((line): line is AutoWidthLineMetrics => line !== null)
    };
  });
}

/**
 * Recursively measures contiguous unit spans. Spans that fit on one visual row
 * are resolved by one Range query, while only spans crossing a wrap are split.
 * This preserves the legacy per-unit geometry exactly without querying every
 * grapheme/word separately.
 */
export function measureAutoWidthLine(
  element: HTMLElement,
  presegmentedUnits?: TextUnit[]
): AutoWidthLineMetrics | null {
  const kind = element.dataset.autoWidthLine as AutoWidthLineKind | undefined;
  const index = element.dataset.autoWidthLineIndex;
  const textNode = findTextNode(element);
  const text = textNode?.data ?? element.textContent ?? "";
  if (!kind || index === undefined || !textNode || !text.trim()) {
    return null;
  }

  const units = presegmentedUnits ?? segmentTextUnits(text);
  if (units.length === 0) return null;
  const fragments = measureUnitSpans(textNode, units);
  if (fragments.length === 0) return null;

  const visualLines = groupVisualLines(fragments);
  const availableWidth = Math.max(1, element.clientWidth);
  const fills = visualLines.map((line) => Math.min(1.5, (line.right - line.left) / availableWidth));
  const lastLine = visualLines[visualLines.length - 1];
  const lastLineFill = fills[fills.length - 1] ?? 0;
  const lastUnits = Array.from(lastLine.unitIndexes)
    .sort((left, right) => left - right)
    .map((unitIndex) => units[unitIndex]);
  const cjkCount = lastUnits.filter((unit) => unit.kind === "cjk").length;
  const wordUnits = lastUnits.filter((unit) => unit.kind === "word");
  const wordCharacterCount = wordUnits.reduce((total, unit) => total + unit.text.replace(/[^\p{L}\p{N}]/gu, "").length, 0);
  const severeOrphan = visualLines.length > 1 && lastLineFill <= 0.3 && (
    (cjkCount > 0 && lastUnits.length <= 2) ||
    (cjkCount === 0 && wordUnits.length > 0 && wordUnits.length <= 2 && wordCharacterCount <= 14)
  );
  const bounds = element.getBoundingClientRect();
  const horizontalOverflow = element.scrollWidth > element.clientWidth + 4 ||
    visualLines.some((line) => line.left < bounds.left - 4 || line.right > bounds.right + 4);

  return {
    key: `${kind}:${index}`,
    kind,
    logicalUnitCount: units.length,
    visualLineCount: visualLines.length,
    lastLineUnitCount: lastUnits.length,
    lastLineFill,
    maxLineFill: Math.max(...fills),
    averageLineFill: fills.reduce((total, fill) => total + fill, 0) / fills.length,
    severeOrphan,
    horizontalOverflow
  };
}

function readMeasurementTargets(host: HTMLElement): AutoWidthMeasurementTarget[] {
  const serialized = host.dataset.autoWidthMeasurementGrid;
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((target): target is AutoWidthMeasurementTarget => {
        if (!target || typeof target !== "object") return false;
        const candidate = target as Partial<AutoWidthMeasurementTarget>;
        return Number.isFinite(candidate.canvasWidth) &&
          Number.isFinite(candidate.contentWidth) &&
          Number(candidate.contentWidth) > 0;
      })
      .map(({ canvasWidth, contentWidth }) => ({
        canvasWidth: Number(canvasWidth),
        contentWidth: Number(contentWidth)
      }))
      .sort((left, right) => left.canvasWidth - right.canvasWidth);
  } catch {
    return [];
  }
}

function findTextNode(element: HTMLElement) {
  return Array.from(element.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
}

function measureUnitSpans(textNode: Text, units: TextUnit[]) {
  const range = document.createRange();
  const fragments: UnitSpanFragment[] = [];

  const measureSpan = (firstUnit: number, lastUnit: number) => {
    range.setStart(textNode, units[firstUnit].start);
    range.setEnd(textNode, units[lastUnit].end);
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map(({ top, left, right }) => ({ top, left, right }));
    if (rects.length === 0) return;

    if (firstUnit === lastUnit || countVisualRows(rects) === 1) {
      fragments.push(...rects.map((rect) => ({ ...rect, firstUnit, lastUnit })));
      return;
    }

    const middle = Math.floor((firstUnit + lastUnit) / 2);
    measureSpan(firstUnit, middle);
    measureSpan(middle + 1, lastUnit);
  };

  measureSpan(0, units.length - 1);
  range.detach();
  return fragments;
}

function countVisualRows(fragments: RectFragment[]) {
  const tops: number[] = [];
  for (const fragment of fragments) {
    if (!tops.some((top) => Math.abs(top - fragment.top) <= 2)) {
      tops.push(fragment.top);
    }
  }
  return tops.length;
}

export function segmentTextUnits(text: string): TextUnit[] {
  const graphemes = getGraphemes(text);
  const units: TextUnit[] = [];
  let pendingWord: TextUnit | null = null;

  const flushWord = () => {
    if (pendingWord) units.push(pendingWord);
    pendingWord = null;
  };

  for (const grapheme of graphemes) {
    if (isCjk(grapheme.segment)) {
      flushWord();
      units.push({
        start: grapheme.index,
        end: grapheme.index + grapheme.segment.length,
        kind: "cjk",
        text: grapheme.segment
      });
      continue;
    }
    if (isWordCharacter(grapheme.segment)) {
      if (!pendingWord) {
        pendingWord = {
          start: grapheme.index,
          end: grapheme.index + grapheme.segment.length,
          kind: "word",
          text: grapheme.segment
        };
      } else {
        pendingWord.end = grapheme.index + grapheme.segment.length;
        pendingWord.text += grapheme.segment;
      }
      continue;
    }
    if (isWordJoiner(grapheme.segment) && pendingWord) {
      pendingWord.end = grapheme.index + grapheme.segment.length;
      pendingWord.text += grapheme.segment;
      continue;
    }
    flushWord();
    // Punctuation belongs to the preceding unit for orphan detection; whitespace
    // remains only a browser wrap opportunity and is not scored as content.
    if (!/^\s+$/u.test(grapheme.segment) && units.length > 0) {
      const previous = units[units.length - 1];
      previous.end = grapheme.index + grapheme.segment.length;
      previous.text += grapheme.segment;
    }
  }
  flushWord();
  return units;
}

function getGraphemes(text: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment, index }) => ({ segment, index }));
  }

  const graphemes: Array<{ segment: string; index: number }> = [];
  let index = 0;
  for (const segment of Array.from(text)) {
    graphemes.push({ segment, index });
    index += segment.length;
  }
  return graphemes;
}

function groupVisualLines(fragments: UnitSpanFragment[]) {
  const lines: Array<RectFragment & { unitIndexes: Set<number> }> = [];
  // Subpixel font rendering can shift rect tops slightly within one visual row.
  for (const fragment of [...fragments].sort((left, right) => left.top - right.top || left.left - right.left)) {
    const line = lines.find((candidate) => Math.abs(candidate.top - fragment.top) <= 2);
    if (line) {
      line.left = Math.min(line.left, fragment.left);
      line.right = Math.max(line.right, fragment.right);
      addUnitSpan(line.unitIndexes, fragment.firstUnit, fragment.lastUnit);
    } else {
      const unitIndexes = new Set<number>();
      addUnitSpan(unitIndexes, fragment.firstUnit, fragment.lastUnit);
      lines.push({ top: fragment.top, left: fragment.left, right: fragment.right, unitIndexes });
    }
  }
  return lines;
}

function addUnitSpan(unitIndexes: Set<number>, firstUnit: number, lastUnit: number) {
  for (let index = firstUnit; index <= lastUnit; index += 1) {
    unitIndexes.add(index);
  }
}

function isCjk(value: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

function isWordCharacter(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

function isWordJoiner(value: string) {
  return /^[’'\-‐‑]$/u.test(value);
}
