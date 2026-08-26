import {
  applyUnitTranslations,
  getLyricDocumentRows,
  serializeLyricDocumentTranslation,
  type LyricDocumentV2,
  type LyricUnitTranslationUpdate
} from "@/lib/lyrics-document-v2";

export class StructuredTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredTranslationError";
  }
}

export function parseStructuredTranslation(text: string, document: LyricDocumentV2) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StructuredTranslationError("The model did not return valid structured translation JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new StructuredTranslationError("The structured translation response must be an array.");
  }
  const expectedIds = getLyricDocumentRows(document)
    .filter((row) => row.source.some((line) => line.trim().length > 0))
    .map((row) => row.unitId);
  if (parsed.length !== expectedIds.length) {
    throw new StructuredTranslationError("The structured translation response did not cover every lyric unit.");
  }
  const updates: LyricUnitTranslationUpdate[] = parsed.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new StructuredTranslationError("A structured translation item is invalid.");
    }
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).some((key) => key !== "id" && key !== "translation") ||
      record.id !== expectedIds[index] ||
      !Array.isArray(record.translation) ||
      record.translation.length === 0 ||
      !record.translation.every((line) => typeof line === "string")
    ) {
      throw new StructuredTranslationError("A structured translation item changed an ID or has invalid lines.");
    }
    return { id: record.id, translation: record.translation as string[] };
  });
  const updated = applyUnitTranslations(document, updates, document.revision);
  if (!updated) {
    throw new StructuredTranslationError("The structured translation no longer matches this lyric document.");
  }
  return {
    document: updated,
    text: serializeLyricDocumentTranslation(updated),
    updates
  };
}

export function tryParseStructuredTranslation(text: string, document: LyricDocumentV2) {
  try {
    return parseStructuredTranslation(text, document);
  } catch {
    return null;
  }
}

export function redactStructuredTranslationDiagnostics(text: string, document: LyricDocumentV2) {
  const ids = [
    document.id,
    ...document.blocks.flatMap((block) => [block.id, ...block.units.map((unit) => unit.id)])
  ].sort((left, right) => right.length - left.length);
  let redacted = text;
  for (const id of ids) redacted = redacted.replaceAll(id, "[lyric reference]");
  return redacted
    .replace(/\b(?:document|block|unit)-[a-z0-9-]*/giu, "[lyric reference]")
    .replace(/\b(?:LyricDocumentV2|schemaVersion|unitId|blockId)\b/gu, "lyric reference");
}
