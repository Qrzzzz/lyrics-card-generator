import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  applyUnitTranslations,
  createLyricDocumentV2,
  getLyricDocumentRows,
  insertUnit,
  mergeUnits,
  moveUnit,
  reconcileLyricDocumentV2,
  serializeLyricDocument,
  splitUnit,
  updateUnit
} from "../lib/lyrics-document-v2";
import { buildStructuredLyricsTranslationPrompt } from "../lib/ai/prompt";
import {
  parseStructuredTranslation,
  redactStructuredTranslationDiagnostics
} from "../lib/ai/structured-translation";
import { serializeImportHistoryManualSave } from "../lib/import-history";

const require = createRequire(import.meta.url);
const { isCanonicalManualSaveEnvelope } = require("../electron/import-history.js") as {
  isCanonicalManualSaveEnvelope: (value: string) => boolean;
};

function idFactory() {
  let id = 0;
  return (prefix: string) => `${prefix}-${++id}`;
}

{
  const source = "\nFirst line\nSecond line\n\nThird line\n";
  const translation = "译文一\n译文二\n\n译文三\n\n";
  const document = createLyricDocumentV2(source, translation, { idFactory: idFactory() });
  assert.deepEqual(serializeLyricDocument(document), { source, translation });
  assert.equal(document.blocks.length, 2);
  assert.equal(document.blocks[0]?.units.length, 2);
  assert.equal(document.blocks[1]?.units[0]?.translation?.[0], "译文三");
}

{
  const ids = idFactory();
  const document = createLyricDocumentV2("A\nB\nC", "甲\n乙\n丙", { idFactory: ids });
  const rows = getLyricDocumentRows(document);
  const reconciled = reconcileLyricDocumentV2(document, "A\nNEW\nB\nC", "甲\n新\n乙\n丙", ids);
  const nextRows = getLyricDocumentRows(reconciled);
  assert.equal(nextRows[0]?.unitId, rows[0]?.unitId);
  assert.equal(nextRows[2]?.unitId, rows[1]?.unitId);
  assert.equal(nextRows[3]?.unitId, rows[2]?.unitId);
  assert.equal(reconciled.id, document.id);
  assert.equal(reconciled.revision, document.revision + 1);
}

{
  const ids = idFactory();
  let document = createLyricDocumentV2("A\nB", "甲\n乙", { idFactory: ids });
  const blockId = document.blocks[0]!.id;
  const firstId = document.blocks[0]!.units[0]!.id;
  const secondId = document.blocks[0]!.units[1]!.id;
  document = mergeUnits(document, secondId, firstId);
  assert.equal(document.blocks[0]?.units[0]?.id, firstId);
  assert.deepEqual(document.blocks[0]?.units[0]?.source, ["A", "B"]);
  document = splitUnit(document, firstId, 1, 1, ids);
  assert.equal(document.blocks[0]?.units.length, 2);
  document = insertUnit(document, blockId, 1, { source: ["X"], translation: ["叉"] }, ids);
  assert.deepEqual(serializeLyricDocument(document), { source: "A\nX\nB", translation: "甲\n叉\n乙" });
  const insertedId = document.blocks[0]!.units[1]!.id;
  document = updateUnit(document, insertedId, { source: ["XX"] });
  document = moveUnit(document, insertedId, blockId, 0);
  assert.equal(document.blocks[0]?.units[0]?.source[0], "XX");
  assert.throws(
    () => insertUnit(document, blockId, 0, { id: firstId, source: ["duplicate"] }),
    /must be unique/
  );
  assert.throws(
    () => splitUnit(document, insertedId, 1, 0, () => firstId),
    /must be unique/
  );
}

{
  const document = createLyricDocumentV2("A\nB", "", { idFactory: idFactory() });
  const rows = getLyricDocumentRows(document);
  const updated = applyUnitTranslations(document, [
    { id: rows[0]!.unitId, translation: "甲" },
    { id: rows[1]!.unitId, translation: ["乙"] }
  ], document.revision);
  assert.ok(updated);
  assert.equal(updated.revision, document.revision + 1);
  assert.equal(applyUnitTranslations(updated, [], document.revision), null);
  assert.equal(applyUnitTranslations(document, [{ id: "unknown", translation: "?" }]), null);
}

{
  const document = createLyricDocumentV2("A\nB", "", { idFactory: idFactory() });
  const rows = getLyricDocumentRows(document);
  const response = JSON.stringify(rows.map((row, index) => ({
    id: row.unitId,
    translation: [`译文 ${index + 1}`]
  })));
  const translated = parseStructuredTranslation(response, document);
  assert.equal(translated.document.revision, document.revision + 1);
  assert.equal(translated.text, "译文 1\n译文 2");
  assert.throws(
    () => parseStructuredTranslation(response.replace(rows[0]!.unitId, "wrong-id"), document),
    /changed an ID/
  );
  assert.throws(
    () => parseStructuredTranslation(JSON.stringify([{ ...JSON.parse(response)[0], extra: true }, JSON.parse(response)[1]]), document),
    /invalid lines/
  );
  const prompt = buildStructuredLyricsTranslationPrompt({ document, targetLocale: "zh" });
  assert.ok(prompt.includes(rows[0]!.unitId));
  assert.ok(prompt.includes('"translation":["translated line"]'));
  const diagnostics = redactStructuredTranslationDiagnostics(
    `Working on ${rows[0]!.unitId} in LyricDocumentV2 schemaVersion`,
    document
  );
  assert.ok(!diagnostics.includes(rows[0]!.unitId));
  assert.ok(!diagnostics.includes("LyricDocumentV2"));
}

{
  const document = createLyricDocumentV2("A\n\nB", "甲\n\n乙", { idFactory: idFactory() });
  const envelope = serializeImportHistoryManualSave({
    snapshot: {
      source: "unknown",
      title: "Archive",
      artist: "Artist",
      lyrics: "stale compatibility value",
      translationText: "stale compatibility value",
      translationEnabled: true,
      lyricDocument: document
    }
  });
  assert.ok(envelope);
  assert.equal(isCanonicalManualSaveEnvelope(envelope), true);
  const payload = JSON.parse(envelope);
  assert.equal(payload.version, 2);
  assert.equal(payload.snapshot.lyrics, "A\n\nB");
  assert.equal(payload.snapshot.lyricDocument.blocks[0].units[0].id, document.blocks[0]!.units[0]!.id);
  payload.snapshot.translationText = "mismatched";
  assert.equal(isCanonicalManualSaveEnvelope(JSON.stringify(payload)), false);
}

console.log(JSON.stringify({ ok: true, lyricDocumentV2Tests: 37 }, null, 2));
