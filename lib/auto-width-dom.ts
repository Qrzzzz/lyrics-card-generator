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

type UnitFragment = TextUnit & {
  top: number;
  left: number;
  right: number;
};

export function measureAutoWidthCandidates(host: HTMLElement): AutoWidthCandidateMetrics[] {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-auto-width-candidate]"))
    .map((candidate) => {
      const canvasWidth = Number(candidate.dataset.autoWidthCandidate);
      return {
        canvasWidth,
        lines: Array.from(candidate.querySelectorAll<HTMLElement>("[data-auto-width-line]"))
          .map((line) => measureAutoWidthLine(line))
          .filter((line): line is AutoWidthLineMetrics => line !== null)
      };
    })
    .filter((candidate) => Number.isFinite(candidate.canvasWidth))
    .sort((left, right) => left.canvasWidth - right.canvasWidth);
}

export function measureAutoWidthLine(element: HTMLElement): AutoWidthLineMetrics | null {
  const kind = element.dataset.autoWidthLine as AutoWidthLineKind | undefined;
  const index = element.dataset.autoWidthLineIndex;
  const textNode = Array.from(element.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
  const text = textNode?.data ?? element.textContent ?? "";
  if (!kind || index === undefined || !textNode || !text.trim()) {
    return null;
  }

  const units = segmentTextUnits(text);
  if (units.length === 0) return null;
  const fragments: UnitFragment[] = [];
  const range = document.createRange();
  for (const unit of units) {
    range.setStart(textNode, unit.start);
    range.setEnd(textNode, unit.end);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      fragments.push({ ...unit, top: rect.top, left: rect.left, right: rect.right });
    }
  }
  range.detach();
  if (fragments.length === 0) return null;

  const visualLines = groupVisualLines(fragments);
  const availableWidth = Math.max(1, element.clientWidth);
  const fills = visualLines.map((line) => Math.min(1.5, (line.right - line.left) / availableWidth));
  const lastLine = visualLines[visualLines.length - 1];
  const lastLineFill = fills[fills.length - 1] ?? 0;
  const lastUnits = dedupeUnits(lastLine.fragments);
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

function groupVisualLines(fragments: UnitFragment[]) {
  const lines: Array<{ top: number; left: number; right: number; fragments: UnitFragment[] }> = [];
  for (const fragment of [...fragments].sort((left, right) => left.top - right.top || left.left - right.left)) {
    const line = lines.find((candidate) => Math.abs(candidate.top - fragment.top) <= 2);
    if (line) {
      line.left = Math.min(line.left, fragment.left);
      line.right = Math.max(line.right, fragment.right);
      line.fragments.push(fragment);
    } else {
      lines.push({ top: fragment.top, left: fragment.left, right: fragment.right, fragments: [fragment] });
    }
  }
  return lines;
}

function dedupeUnits(fragments: UnitFragment[]): TextUnit[] {
  const seen = new Set<string>();
  return fragments.filter((fragment) => {
    const key = `${fragment.start}:${fragment.end}:${fragment.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
