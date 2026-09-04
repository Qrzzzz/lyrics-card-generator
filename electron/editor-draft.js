const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_DRAFT_BYTES = 4 * 1024 * 1024;
const MAX_COVER_BYTES = 20 * 1024 * 1024;
const ASSET_ID = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
const BOOLEANS = new Set(["autoWidth", "autoHeight", "customFontEnabled", "allowMultiLineTitle", "showCover", "showSongInfo", "showAlbumName", "showGeneratedWatermark", "showSharedBy", "showWatermark", "showPlatformBadge", "showFineGrid"]);
const NUMBERS = new Set(["width", "height", "customFontWeight", "lyricFontSize", "lineHeight", "translationScale", "coverCropScale"]);
const STRINGS = new Set(["customFontFamily", "customFontLabel", "customTextColor", "resolvedTextColor", "instrumentalText", "sharedByText", "watermark"]);
const ENUMS = {
  backgroundMode: ["palette", "gradient"], layoutMode: ["portrait", "landscape"],
  ratio: ["1:1", "4:5", "9:16", "16:9", "21:9", "3:2", "custom"],
  font: ["sans-heavy", "serif-heavy", "system-sans", "system-serif"],
  align: ["left", "center"], textColorMode: ["auto", "preset", "custom"],
  textColorPreset: ["white", "black", "warmWhite", "cream", "charcoal", "softBlue", "softGold"],
  contentMode: ["lyrics", "instrumental"], fineGridDensity: ["sparse", "medium", "dense"], customFontStyle: ["normal", "italic"]
};

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function number(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000; }
function text(value, length = 2048) { return typeof value === "string" && value.length <= length; }

function normalizeDraftStyle(input) {
  if (!object(input)) return null;
  const style = {};
  for (const [key, value] of Object.entries(input)) {
    if (BOOLEANS.has(key)) { if (typeof value !== "boolean") return null; style[key] = value; }
    else if (NUMBERS.has(key)) { if (!number(value)) return null; style[key] = value; }
    else if (STRINGS.has(key)) { if (!text(value)) return null; style[key] = value; }
    else if (ENUMS[key]) { if (!ENUMS[key].includes(value)) return null; style[key] = value; }
  }
  if (!style.contentMode || !style.layoutMode || !style.ratio || !style.font) return null;
  if (input.fontScheme !== undefined) {
    const font = input.fontScheme;
    if (!object(font) || !["preset", "custom"].includes(font.mode) ||
      !text(font.cjkFontFamily, 512) || !text(font.latinFontFamily, 512) ||
      (font.presetId !== undefined && !["source-han-sans", "source-han-serif"].includes(font.presetId))) return null;
    style.fontScheme = { mode: font.mode, cjkFontFamily: font.cjkFontFamily, latinFontFamily: font.latinFontFamily,
      ...(font.presetId ? { presetId: font.presetId } : {}) };
  }
  if (input.landscapeLayout !== undefined) {
    const layout = input.landscapeLayout;
    if (!object(layout) || typeof layout.autoLyricsWidth !== "boolean" || typeof layout.autoHeight !== "boolean" ||
      !number(layout.lyricsWidth) || !number(layout.requestedHeight)) return null;
    style.landscapeLayout = { autoLyricsWidth: layout.autoLyricsWidth, autoHeight: layout.autoHeight,
      lyricsWidth: layout.lyricsWidth, requestedHeight: layout.requestedHeight };
  }
  return style;
}

function normalizeEditorDraft(input, normalizeContent) {
  if (!object(input) || input.version !== 1 || !object(input.view)) return null;
  const content = normalizeContent(input.content);
  const style = normalizeDraftStyle(input.style);
  if (!content?.lyricDocument || !style || !Number.isInteger(input.view.step) || input.view.step < 0 || input.view.step > 5 ||
    !["png", "jpg", "webp"].includes(input.view.exportFormat) || !["low", "medium", "high"].includes(input.view.exportQuality)) return null;
  const view = { step: input.view.step, exportFormat: input.view.exportFormat, exportQuality: input.view.exportQuality };
  if (input.view.songInfoDraft !== undefined) {
    const form = normalizeContent({ ...content, ...input.view.songInfoDraft });
    if (!form) return null;
    view.songInfoDraft = { title: form.title, artist: form.artist, album: form.album, source: form.source,
      explicit: form.explicit, coverUrl: form.coverUrl, originalCoverUrl: form.originalCoverUrl,
      originalUrl: form.originalUrl, finalUrl: form.finalUrl, parseMethod: form.parseMethod };
  }
  const result = { version: 1, content, style, view };
  for (const key of ["lastPortraitSize", "lastPortraitCustomSize", "lastLandscapeSize"]) {
    const size = input[key];
    if (size === undefined) continue;
    if (!object(size) || !ENUMS.ratio.includes(size.ratio) || !number(size.width) || !number(size.height) ||
      (size.autoWidth !== undefined && typeof size.autoWidth !== "boolean") ||
      (size.autoHeight !== undefined && typeof size.autoHeight !== "boolean")) return null;
    result[key] = { ratio: size.ratio, width: size.width, height: size.height,
      ...(size.autoWidth !== undefined ? { autoWidth: size.autoWidth } : {}),
      ...(size.autoHeight !== undefined ? { autoHeight: size.autoHeight } : {}) };
  }
  for (const key of ["coverAsset", "formCoverAsset"]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || !ASSET_ID.test(input[key])) return null;
    result[key] = input[key];
  }
  return result;
}

/** Immutable content-addressed images; IPC never accepts a filesystem path. */
class EditorDraftAssets {
  constructor(directory) { this.directory = directory; }
  async save(dataUrl) {
    if (typeof dataUrl !== "string" || dataUrl.length > Math.ceil(MAX_COVER_BYTES / 3) * 4 + 64) throw new Error("draft_cover_too_large");
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
    if (!match) throw new Error("invalid_draft_cover");
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_COVER_BYTES || bytes.toString("base64") !== match[2]) throw new Error("invalid_draft_cover");
    const valid = match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : match[1] === "gif" ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))
          : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    if (!valid) throw new Error("invalid_draft_cover");
    const id = crypto.createHash("sha256").update(bytes).digest("hex") + "." + (match[1] === "jpeg" ? "jpg" : match[1]);
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, id);
    try {
      const existing = await fs.readFile(target);
      if (existing.equals(bytes)) return id;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const temporary = `${target}.tmp-${crypto.randomUUID()}`;
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(temporary, target);
    }
    finally { await fs.rm(temporary, { force: true }); }
    return id;
  }
  async read(id) {
    if (typeof id !== "string" || !ASSET_ID.test(id)) throw new Error("invalid_draft_cover");
    const target = path.join(this.directory, id);
    const handle = await fs.open(target, "r");
    try {
      if ((await handle.stat()).size > MAX_COVER_BYTES) throw new Error("draft_cover_too_large");
      const bytes = await handle.readFile();
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== id.split(".")[0]) throw new Error("draft_cover_corrupt");
      return `data:image/${id.endsWith(".jpg") ? "jpeg" : id.split(".")[1]};base64,${bytes.toString("base64")}`;
    } finally { await handle.close(); }
  }
  async hydrate(recordId, snapshot) {
    return { recordId, snapshot,
      ...(snapshot.coverAsset ? { coverDataUrl: await this.read(snapshot.coverAsset) } : {}),
      ...(snapshot.formCoverAsset ? { formCoverDataUrl: await this.read(snapshot.formCoverAsset) } : {}) };
  }
}

module.exports = { MAX_DRAFT_BYTES, normalizeEditorDraft, EditorDraftAssets };
