export interface LyricDocumentV2 {
  schemaVersion: 2;
  id: string;
  revision: number;
  blocks: LyricBlock[];
  /** Exact leading blank-line text for lossless plain-text round trips. */
  formatting?: LyricDocumentFormatting;
}

export interface LyricBlock {
  id: string;
  units: LyricUnit[];
  /** Track-local paragraph presence and separators are formatting, not semantics. */
  formatting?: LyricBlockFormatting;
}

export interface LyricUnit {
  id: string;
  source: string[];
  translation?: string[];
}

export type LyricDocumentFormatting = {
  sourcePrefix: string;
  translationPrefix: string;
};

export type LyricBlockFormatting = {
  sourcePresent: boolean;
  translationPresent: boolean;
  sourceSeparatorAfter: string;
  translationSeparatorAfter: string;
};

export type LyricDocumentPlainText = {
  source: string;
  translation: string;
};

export type LyricDocumentRow = {
  blockId: string;
  unitId: string;
  source: string[];
  translation: string[];
  isBlockStart: boolean;
  sourceGapBeforeLines: number;
  translationGapBeforeLines: number;
};

export type LyricUnitTranslationUpdate = {
  id: string;
  translation: string | string[];
};

type TrackBlockDraft = {
  lines: string[];
  separatorAfter: string;
};

type TrackDraft = {
  prefix: string;
  blocks: TrackBlockDraft[];
};

type BlockDraft = {
  units: Array<{ source: string[]; translation?: string[] }>;
  formatting: LyricBlockFormatting;
};

let fallbackIdCounter = 0;

export function createEmptyLyricDocument(idFactory: (prefix: string) => string = createLyricId): LyricDocumentV2 {
  return {
    schemaVersion: 2,
    id: idFactory("document"),
    revision: 0,
    blocks: [],
    formatting: { sourcePrefix: "", translationPrefix: "" }
  };
}

export function createLyricDocumentV2(
  source: string,
  translation = "",
  options: {
    documentId?: string;
    revision?: number;
    idFactory?: (prefix: string) => string;
  } = {}
): LyricDocumentV2 {
  const idFactory = options.idFactory ?? createLyricId;
  const draft = parseDocumentDraft(source, translation);
  return {
    schemaVersion: 2,
    id: options.documentId ?? idFactory("document"),
    revision: options.revision ?? 0,
    blocks: draft.blocks.map((block) => ({
      id: idFactory("block"),
      formatting: block.formatting,
      units: block.units.map((unit) => ({
        id: idFactory("unit"),
        source: unit.source,
        ...(unit.translation ? { translation: unit.translation } : {})
      }))
    })),
    formatting: draft.formatting
  };
}

/**
 * Rebuilds the structured projection after plain-text editing while preserving
 * document, block, and unit identities wherever content or position still
 * identifies the same authored object.
 */
export function reconcileLyricDocumentV2(
  previous: LyricDocumentV2,
  source: string,
  translation: string,
  idFactory: (prefix: string) => string = createLyricId
): LyricDocumentV2 {
  const currentText = serializeLyricDocument(previous);
  const normalizedSource = normalizeNewlines(source);
  const normalizedTranslation = normalizeNewlines(translation);
  if (currentText.source === normalizedSource && currentText.translation === normalizedTranslation) {
    return previous;
  }

  const draft = parseDocumentDraft(normalizedSource, normalizedTranslation);
  const blockMatches = reconcileSequence(
    previous.blocks,
    draft.blocks,
    blockSignature,
    draftBlockSignature
  );

  const blocks = draft.blocks.map((nextBlock, blockIndex) => {
    const previousBlock = blockMatches[blockIndex];
    const unitMatches = reconcileSequence(
      previousBlock?.units ?? [],
      nextBlock.units,
      unitSignature,
      draftUnitSignature
    );
    return {
      id: previousBlock?.id ?? idFactory("block"),
      formatting: nextBlock.formatting,
      units: nextBlock.units.map((nextUnit, unitIndex) => ({
        id: unitMatches[unitIndex]?.id ?? idFactory("unit"),
        source: [...nextUnit.source],
        ...(nextUnit.translation ? { translation: [...nextUnit.translation] } : {})
      }))
    } satisfies LyricBlock;
  });

  return {
    schemaVersion: 2,
    id: previous.id,
    revision: previous.revision + 1,
    blocks,
    formatting: draft.formatting
  };
}

export function isLyricDocumentV2(value: unknown): value is LyricDocumentV2 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LyricDocumentV2>;
  if (!(candidate.schemaVersion === 2 &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    Number.isSafeInteger(candidate.revision) &&
    (candidate.revision ?? -1) >= 0 &&
    Array.isArray(candidate.blocks) &&
    candidate.blocks.every(isLyricBlock) &&
    (candidate.formatting === undefined || isDocumentFormatting(candidate.formatting)))) {
    return false;
  }
  const ids = new Set<string>([candidate.id]);
  for (const block of candidate.blocks) {
    if (ids.has(block.id)) return false;
    ids.add(block.id);
    for (const unit of block.units) {
      if (ids.has(unit.id)) return false;
      ids.add(unit.id);
    }
  }
  return true;
}

export function migrateLyricDocumentV2(
  value: unknown,
  legacy: { lyrics?: string; translationText?: string } = {}
): LyricDocumentV2 {
  if (isLyricDocumentV2(value)) return cloneLyricDocument(value);
  return createLyricDocumentV2(legacy.lyrics ?? "", legacy.translationText ?? "");
}

export function serializeLyricDocument(document: LyricDocumentV2): LyricDocumentPlainText {
  return {
    source: serializeTrack(document, "source"),
    translation: serializeTrack(document, "translation")
  };
}

export function serializeLyricDocumentSource(document: LyricDocumentV2) {
  return serializeTrack(document, "source");
}

export function serializeLyricDocumentTranslation(document: LyricDocumentV2) {
  return serializeTrack(document, "translation");
}

export function getLyricDocumentRows(document: LyricDocumentV2): LyricDocumentRow[] {
  const sourceGaps = trackGapBeforeLines(document, "source");
  const translationGaps = trackGapBeforeLines(document, "translation");
  return document.blocks.flatMap((block, blockIndex) => block.units.map((unit, unitIndex) => ({
      blockId: block.id,
      unitId: unit.id,
      source: [...unit.source],
      translation: [...(unit.translation ?? [])],
      isBlockStart: unitIndex === 0,
      sourceGapBeforeLines: unitIndex === 0 ? sourceGaps[blockIndex] : 0,
      translationGapBeforeLines: unitIndex === 0 ? translationGaps[blockIndex] : 0
    })));
}

export function hasAuthoredLyrics(document: LyricDocumentV2) {
  return document.blocks.some((block) => block.units.some((unit) => (
    unit.source.some((line) => line.trim().length > 0) ||
    unit.translation?.some((line) => line.trim().length > 0)
  )));
}

export function countLyricDocumentLines(document: LyricDocumentV2, translationEnabled = true) {
  let source = 0;
  let translation = 0;
  for (const block of document.blocks) {
    for (const unit of block.units) {
      source += unit.source.filter((line) => line.trim().length > 0).length;
      if (translationEnabled) {
        translation += (unit.translation ?? []).filter((line) => line.trim().length > 0).length;
      }
    }
  }
  return { source, translation, total: source + translation };
}

export function insertUnit(
  document: LyricDocumentV2,
  blockId: string,
  index: number,
  unit: Omit<LyricUnit, "id"> & { id?: string },
  idFactory: (prefix: string) => string = createLyricId
) {
  return updateBlock(document, blockId, (block) => {
    const nextId = unit.id ?? idFactory("unit");
    assertAvailableLyricId(document, nextId);
    const insertionIndex = clamp(index, 0, block.units.length);
    const nextUnit: LyricUnit = {
      id: nextId,
      source: [...unit.source],
      ...(unit.translation ? { translation: [...unit.translation] } : {})
    };
    return { ...block, units: block.units.toSpliced(insertionIndex, 0, nextUnit) };
  });
}

export function removeUnit(document: LyricDocumentV2, unitId: string) {
  return updateUnitContainer(document, unitId, (block, index) => ({
    ...block,
    units: block.units.toSpliced(index, 1)
  }));
}

export function updateUnit(
  document: LyricDocumentV2,
  unitId: string,
  update: Partial<Pick<LyricUnit, "source" | "translation">>
) {
  return updateUnitContainer(document, unitId, (block, index) => ({
    ...block,
    units: block.units.with(index, {
      ...block.units[index],
      ...(update.source ? { source: [...update.source] } : {}),
      ...(update.translation === undefined
        ? {}
        : update.translation.length > 0
          ? { translation: [...update.translation] }
          : { translation: undefined })
    })
  }));
}

export function updateTranslation(document: LyricDocumentV2, unitId: string, translation?: string[]) {
  return updateUnit(document, unitId, { translation: translation ?? [] });
}

export function mergeUnits(document: LyricDocumentV2, firstUnitId: string, secondUnitId: string) {
  for (const block of document.blocks) {
    const firstIndex = block.units.findIndex((unit) => unit.id === firstUnitId);
    const secondIndex = block.units.findIndex((unit) => unit.id === secondUnitId);
    if (firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) continue;
    const lower = Math.min(firstIndex, secondIndex);
    const upper = Math.max(firstIndex, secondIndex);
    const first = block.units[lower];
    const second = block.units[upper];
    const merged: LyricUnit = {
      id: first.id,
      source: [...first.source, ...second.source],
      ...((first.translation?.length || second.translation?.length)
        ? { translation: [...(first.translation ?? []), ...(second.translation ?? [])] }
        : {})
    };
    const units = block.units.filter((_, index) => index !== lower && index !== upper);
    units.splice(lower, 0, merged);
    return replaceBlock(document, block.id, { ...block, units });
  }
  return document;
}

export function splitUnit(
  document: LyricDocumentV2,
  unitId: string,
  sourceIndex: number,
  translationIndex = sourceIndex,
  idFactory: (prefix: string) => string = createLyricId
) {
  return updateUnitContainer(document, unitId, (block, index) => {
    const nextId = idFactory("unit");
    assertAvailableLyricId(document, nextId);
    const unit = block.units[index];
    const sourceSplit = clamp(sourceIndex, 0, unit.source.length);
    const translation = unit.translation ?? [];
    const translationSplit = clamp(translationIndex, 0, translation.length);
    const first: LyricUnit = {
      id: unit.id,
      source: unit.source.slice(0, sourceSplit),
      ...(translation.slice(0, translationSplit).length
        ? { translation: translation.slice(0, translationSplit) }
        : {})
    };
    const second: LyricUnit = {
      id: nextId,
      source: unit.source.slice(sourceSplit),
      ...(translation.slice(translationSplit).length
        ? { translation: translation.slice(translationSplit) }
        : {})
    };
    return { ...block, units: block.units.toSpliced(index, 1, first, second) };
  });
}

export function moveUnit(
  document: LyricDocumentV2,
  unitId: string,
  targetBlockId: string,
  targetIndex: number
) {
  const sourceBlock = document.blocks.find((block) => block.units.some((unit) => unit.id === unitId));
  const unit = sourceBlock?.units.find((candidate) => candidate.id === unitId);
  const targetBlock = document.blocks.find((block) => block.id === targetBlockId);
  if (!sourceBlock || !unit || !targetBlock) return document;
  const without = document.blocks.map((block) => block.id === sourceBlock.id
    ? { ...block, units: block.units.filter((candidate) => candidate.id !== unitId) }
    : block
  );
  const blocks = without.map((block) => block.id === targetBlockId
    ? { ...block, units: block.units.toSpliced(clamp(targetIndex, 0, block.units.length), 0, unit) }
    : block
  );
  return bump(document, blocks);
}

export function applyUnitTranslations(
  document: LyricDocumentV2,
  updates: LyricUnitTranslationUpdate[],
  expectedRevision = document.revision
) {
  if (document.revision !== expectedRevision) return null;
  const updateMap = new Map(updates.map((update) => [
    update.id,
    Array.isArray(update.translation) ? update.translation : [update.translation]
  ]));
  const knownIds = new Set(document.blocks.flatMap((block) => block.units.map((unit) => unit.id)));
  if (updates.some((update) => !knownIds.has(update.id)) || updateMap.size !== updates.length) return null;
  let changed = false;
  const blocks = document.blocks.map((block) => ({
    ...block,
    units: block.units.map((unit) => {
      const translation = updateMap.get(unit.id);
      if (!translation) return unit;
      if (arraysEqual(unit.translation ?? [], translation)) return unit;
      changed = true;
      return { ...unit, translation: [...translation] };
    })
  }));
  return changed ? bump(document, blocks) : document;
}

export function swapLyricDocumentColumns(document: LyricDocumentV2): LyricDocumentV2 {
  return {
    schemaVersion: 2,
    id: document.id,
    revision: document.revision + 1,
    formatting: {
      sourcePrefix: document.formatting?.translationPrefix ?? "",
      translationPrefix: document.formatting?.sourcePrefix ?? ""
    },
    blocks: document.blocks.map((block) => ({
      id: block.id,
      formatting: {
        sourcePresent: block.formatting?.translationPresent ?? block.units.some((unit) => Boolean(unit.translation)),
        translationPresent: block.formatting?.sourcePresent ?? true,
        sourceSeparatorAfter: block.formatting?.translationSeparatorAfter ?? "",
        translationSeparatorAfter: block.formatting?.sourceSeparatorAfter ?? ""
      },
      units: block.units.map((unit) => ({
        id: unit.id,
        source: [...(unit.translation ?? [])],
        translation: [...unit.source]
      }))
    }))
  };
}

export function cloneLyricDocument(document: LyricDocumentV2): LyricDocumentV2 {
  return {
    schemaVersion: 2,
    id: document.id,
    revision: document.revision,
    formatting: document.formatting ? { ...document.formatting } : undefined,
    blocks: document.blocks.map((block) => ({
      id: block.id,
      formatting: block.formatting ? { ...block.formatting } : undefined,
      units: block.units.map((unit) => ({
        id: unit.id,
        source: [...unit.source],
        ...(unit.translation ? { translation: [...unit.translation] } : {})
      }))
    }))
  };
}

function parseDocumentDraft(source: string, translation: string) {
  const sourceTrack = parseTrack(source);
  const translationTrack = parseTrack(translation);
  const blockCount = Math.max(sourceTrack.blocks.length, translationTrack.blocks.length);
  const blocks: BlockDraft[] = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const sourceBlock = sourceTrack.blocks[blockIndex];
    const translationBlock = translationTrack.blocks[blockIndex];
    const unitCount = Math.max(sourceBlock?.lines.length ?? 0, translationBlock?.lines.length ?? 0);
    const units = Array.from({ length: unitCount }, (_, unitIndex) => {
      const sourceLine = sourceBlock?.lines[unitIndex];
      const translationLine = translationBlock?.lines[unitIndex];
      return {
        source: sourceLine === undefined ? [] : [sourceLine],
        ...(translationLine === undefined ? {} : { translation: [translationLine] })
      };
    });
    blocks.push({
      units,
      formatting: {
        sourcePresent: Boolean(sourceBlock),
        translationPresent: Boolean(translationBlock),
        sourceSeparatorAfter: sourceBlock?.separatorAfter ?? "",
        translationSeparatorAfter: translationBlock?.separatorAfter ?? ""
      }
    });
  }
  return {
    blocks,
    formatting: {
      sourcePrefix: sourceTrack.prefix,
      translationPrefix: translationTrack.prefix
    }
  };
}

function parseTrack(value: string): TrackDraft {
  const text = normalizeNewlines(value);
  if (!text) return { prefix: "", blocks: [] };
  const tokens = tokenizeLines(text);
  let index = 0;
  let prefix = "";
  while (index < tokens.length && isBlank(tokens[index].text)) {
    prefix += tokens[index].text + tokens[index].ending;
    index += 1;
  }
  const blocks: TrackBlockDraft[] = [];
  while (index < tokens.length) {
    const lines: string[] = [];
    let lastEnding = "";
    while (index < tokens.length && !isBlank(tokens[index].text)) {
      lines.push(tokens[index].text);
      lastEnding = tokens[index].ending;
      index += 1;
    }
    let separatorAfter = index < tokens.length || lastEnding ? lastEnding : "";
    while (index < tokens.length && isBlank(tokens[index].text)) {
      separatorAfter += tokens[index].text + tokens[index].ending;
      index += 1;
    }
    if (lines.length > 0) blocks.push({ lines, separatorAfter });
  }
  return { prefix, blocks };
}

function tokenizeLines(text: string) {
  const tokens: Array<{ text: string; ending: string }> = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;
    tokens.push({ text: text.slice(start, index), ending: "\n" });
    start = index + 1;
  }
  if (start < text.length) tokens.push({ text: text.slice(start), ending: "" });
  return tokens;
}

function serializeTrack(document: LyricDocumentV2, track: "source" | "translation") {
  const prefix = track === "source"
    ? document.formatting?.sourcePrefix ?? ""
    : document.formatting?.translationPrefix ?? "";
  let value = prefix;
  for (const block of document.blocks) {
    const formatting = canonicalBlockFormatting(block);
    const present = track === "source" ? formatting.sourcePresent : formatting.translationPresent;
    if (!present) continue;
    const lines = track === "source"
      ? block.units.flatMap((unit) => unit.source)
      : block.units.flatMap((unit) => unit.translation ?? []);
    value += lines.join("\n");
    value += track === "source"
      ? formatting.sourceSeparatorAfter
      : formatting.translationSeparatorAfter;
  }
  return value;
}

function trackGapBeforeLines(document: LyricDocumentV2, track: "source" | "translation") {
  const gaps = Array(document.blocks.length).fill(0) as number[];
  let pendingGap = 0;
  for (let index = 0; index < document.blocks.length; index += 1) {
    const formatting = canonicalBlockFormatting(document.blocks[index]);
    const present = track === "source" ? formatting.sourcePresent : formatting.translationPresent;
    if (!present) continue;
    gaps[index] = pendingGap;
    const separator = track === "source"
      ? formatting.sourceSeparatorAfter
      : formatting.translationSeparatorAfter;
    pendingGap = Math.max(0, countNewlines(separator) - 1);
  }
  return gaps;
}

function countNewlines(value: string) {
  let count = 0;
  for (const character of value) if (character === "\n") count += 1;
  return count;
}

function canonicalBlockFormatting(block: LyricBlock): LyricBlockFormatting {
  return block.formatting ?? {
    sourcePresent: block.units.some((unit) => unit.source.length > 0),
    translationPresent: block.units.some((unit) => (unit.translation?.length ?? 0) > 0),
    sourceSeparatorAfter: "",
    translationSeparatorAfter: ""
  };
}

function reconcileSequence<Old, Next>(
  previous: Old[],
  next: Next[],
  previousSignature: (value: Old) => string,
  nextSignature: (value: Next) => string
) {
  const result: Array<Old | undefined> = Array(next.length).fill(undefined);
  const used = new Set<number>();
  const previousBySignature = new Map<string, number[]>();
  previous.forEach((value, index) => {
    const signature = previousSignature(value);
    const indexes = previousBySignature.get(signature) ?? [];
    indexes.push(index);
    previousBySignature.set(signature, indexes);
  });
  previousBySignature.forEach((indexes) => indexes.reverse());
  let fallbackIndex = 0;
  for (let nextIndex = 0; nextIndex < next.length; nextIndex += 1) {
    const matches = previousBySignature.get(nextSignature(next[nextIndex]));
    const previousIndex = matches?.pop();
    if (previousIndex === undefined) continue;
    result[nextIndex] = previous[previousIndex];
    used.add(previousIndex);
  }
  for (let nextIndex = 0; nextIndex < next.length; nextIndex += 1) {
    if (result[nextIndex]) continue;
    if (nextIndex < previous.length && !used.has(nextIndex)) {
      result[nextIndex] = previous[nextIndex];
      used.add(nextIndex);
      continue;
    }
    while (fallbackIndex < previous.length && used.has(fallbackIndex)) fallbackIndex += 1;
    if (fallbackIndex < previous.length) {
      result[nextIndex] = previous[fallbackIndex];
      used.add(fallbackIndex);
      fallbackIndex += 1;
    }
  }
  return result;
}

function blockSignature(block: LyricBlock) {
  return block.units.map(unitSignature).join("\u001e");
}

function draftBlockSignature(block: BlockDraft) {
  return block.units.map(draftUnitSignature).join("\u001e");
}

function unitSignature(unit: LyricUnit) {
  return `${unit.source.join("\n")}\u001f${(unit.translation ?? []).join("\n")}`;
}

function draftUnitSignature(unit: { source: string[]; translation?: string[] }) {
  return `${unit.source.join("\n")}\u001f${(unit.translation ?? []).join("\n")}`;
}

function updateBlock(
  document: LyricDocumentV2,
  blockId: string,
  update: (block: LyricBlock) => LyricBlock
) {
  const block = document.blocks.find((candidate) => candidate.id === blockId);
  if (!block) return document;
  return replaceBlock(document, blockId, update(block));
}

function updateUnitContainer(
  document: LyricDocumentV2,
  unitId: string,
  update: (block: LyricBlock, index: number) => LyricBlock
) {
  for (const block of document.blocks) {
    const index = block.units.findIndex((unit) => unit.id === unitId);
    if (index >= 0) return replaceBlock(document, block.id, update(block, index));
  }
  return document;
}

function replaceBlock(document: LyricDocumentV2, blockId: string, nextBlock: LyricBlock) {
  return bump(document, document.blocks.map((block) => block.id === blockId ? nextBlock : block));
}

function assertAvailableLyricId(document: LyricDocumentV2, id: string) {
  if (!id || document.id === id || document.blocks.some((block) => (
    block.id === id || block.units.some((unit) => unit.id === id)
  ))) {
    throw new Error(`Lyric document ID must be unique: ${id || "<empty>"}`);
  }
}

function bump(document: LyricDocumentV2, blocks: LyricBlock[]): LyricDocumentV2 {
  return {
    ...document,
    revision: document.revision + 1,
    blocks: blocks
      .filter((block) => block.units.length > 0)
      .map((block) => {
        const formatting = canonicalBlockFormatting(block);
        return {
          ...block,
          formatting: {
            ...formatting,
            sourcePresent: block.units.some((unit) => unit.source.length > 0),
            translationPresent: block.units.some((unit) => (unit.translation?.length ?? 0) > 0)
          }
        };
      })
  };
}

function isLyricBlock(value: unknown): value is LyricBlock {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LyricBlock>;
  return typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    Array.isArray(candidate.units) &&
    candidate.units.length > 0 &&
    candidate.units.every(isLyricUnit) &&
    (candidate.formatting === undefined || isBlockFormatting(candidate.formatting));
}

function isLyricUnit(value: unknown): value is LyricUnit {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LyricUnit>;
  return typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    Array.isArray(candidate.source) &&
    candidate.source.every(isLyricLine) &&
    (candidate.translation === undefined || (
      Array.isArray(candidate.translation) && candidate.translation.every(isLyricLine)
    ));
}

function isDocumentFormatting(value: unknown): value is LyricDocumentFormatting {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LyricDocumentFormatting>;
  return isBlankFormattingText(candidate.sourcePrefix) && isBlankFormattingText(candidate.translationPrefix);
}

function isBlockFormatting(value: unknown): value is LyricBlockFormatting {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LyricBlockFormatting>;
  return typeof candidate.sourcePresent === "boolean" &&
    typeof candidate.translationPresent === "boolean" &&
    isBlankFormattingText(candidate.sourceSeparatorAfter) &&
    isBlankFormattingText(candidate.translationSeparatorAfter);
}

function isLyricLine(value: unknown): value is string {
  return typeof value === "string" && !/[\r\n]/u.test(value);
}

function isBlankFormattingText(value: unknown): value is string {
  return typeof value === "string" && !/[^\t \n]/u.test(value);
}

function createLyricId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n?|\n/gu, "\n");
}

function isBlank(value: string) {
  return value.trim().length === 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
