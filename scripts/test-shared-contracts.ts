import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { defaultState } from "../components/editor/editor-defaults";
import { withLyricSource } from "../lib/lyrics-document-state";
import { createEditorDraftSnapshot, restoreEditorDraft } from "../lib/editor-draft";
import { normalizeAISettings as rendererAISettings } from "../lib/ai/settings-normalize";
import { normalizeDraftStyle } from "../shared/card-style-contract";
const require = createRequire(import.meta.url);
const { normalizeAISettings } = require("../shared/ai-settings");
const { normalizeEditorDraft } = require("../electron/editor-draft");
const { normalizeImportHistoryRecord } = require("../electron/import-history");

async function main() {
  const snapshot = createEditorDraftSnapshot(withLyricSource(defaultState, "contract lyric"), { step: 2, exportFormat: "webp", exportQuality: "high" });
  snapshot.style.fontScheme = { mode: "custom", cjkFontFamily: "Custom 中文", latinFontFamily: "Western" };
  snapshot.style.landscapeLayout = { autoHeight: false, requestedHeight: 1700, autoLyricsWidth: true, lyricsWidth: 550 };
  snapshot.style.separatorStyle = "line";
  snapshot.style.gradientLayoutSeed = 731;
  const schema = JSON.parse(await readFile("shared/card-style-schema.json", "utf8"));
  // Every declared authored key is tested at the actual main-process read gate.
  const normalized = normalizeDraftStyle(JSON.parse(JSON.stringify(snapshot.style)))!;
  assert.ok(normalized);
  for (const key of Object.keys(snapshot.style)) assert.ok(key in schema.definitions.CardStyleInputs.fields, key);
  for (const [key, field] of Object.entries(schema.definitions.CardStyleInputs.fields) as [string, { type?: string; values?: string[]; ref?: string }][]) {
    const supplied = { ...snapshot.style, [key]: field.values?.[0] ?? (field.type === "boolean" ? true : field.type === "number" ? 23 : field.ref ? normalized[key as keyof typeof normalized] : key === "solidColor" ? "#abcdef" : "契約🙂") };
    assert.ok(normalizeDraftStyle(supplied), `${key} is accepted at the draft read gate`);
    assert.equal(normalizeDraftStyle({ ...snapshot.style, [key]: [] }), null, `${key} rejects mismatched runtime types`);
  }
  const normalizeContent = (value: unknown) => normalizeImportHistoryRecord({ id: "roundtrip", kind: "manual-save", createdAt: 1, lastUsedAt: 1, snapshot: value })?.snapshot;
  const persisted = normalizeEditorDraft(JSON.parse(JSON.stringify(snapshot)), normalizeContent);
  assert.ok(persisted);
  const restored = restoreEditorDraft(defaultState, { recordId: "roundtrip", snapshot: persisted });
  assert.equal(restored.style.separatorStyle, "line");
  assert.equal(restored.style.gradientLayoutSeed, 731, "layout seeds survive the desktop draft read gate");
  for (const value of [-1, 0.5, 100001, Infinity, NaN, "23"]) {
    assert.equal(normalizeDraftStyle({ ...snapshot.style, gradientLayoutSeed: value }), null);
  }
  const oldSnapshot = { ...snapshot, style: { ...snapshot.style } };
  delete oldSnapshot.style.gradientLayoutSeed;
  assert.equal(restoreEditorDraft({ ...defaultState, style: { ...defaultState.style, gradientLayoutSeed: 42 } },
    { recordId: "legacy", snapshot: oldSnapshot }).style.gradientLayoutSeed, 0, "old drafts use the default layout rather than inheriting another document's seed");
  assert.equal(restored.style.fontScheme?.cjkFontFamily, "Custom 中文");
  assert.equal(restored.style.landscapeLayout?.requestedHeight, 1700);
  assert.deepEqual(normalizeDraftStyle({ contentMode: "lyrics", layoutMode: "portrait", ratio: "1:1", font: "sans-heavy", futureField: true }),
    { contentMode: "lyrics", layoutMode: "portrait", ratio: "1:1", font: "sans-heavy" }, "legacy partial styles and unknown fields remain compatible");
  for (const input of [null, [], 1, {}, { temperature: "3", defaultStyle: "faithful", promptLibrary: { hiddenStyleIds: ["faithful"] } },
    { model: " test ", promptLibrary: { styleOverrides: [{ id: "lyrical", prompt: "legacy" }], customPresets: [{ id: "custom:one", title: "one", prompt: "first" }, { id: "custom:one", title: "second", prompt: "second" }] } }]) {
    assert.deepEqual(rendererAISettings(input), normalizeAISettings(input), "renderer and main use the same migration and normalizer");
  }
  for (const directory of ["lib", "app"]) {
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(directory, { recursive: true })) {
      if (!/\.tsx?$/.test(entry)) continue;
      assert.doesNotMatch(await readFile(`${directory}/${entry}`, "utf8"), /@\/electron\//, `${directory}/${entry} keeps shared logic out of the platform directory`);
    }
  }
  console.log("Shared contracts: every authored field, old draft migration, settings normalization and platform dependency direction passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
