const { normalizeFontOptions } = require("../electron/font-options");

const options = normalizeFontOptions([
  { label: "方正舒体 (TrueType)", family: "FZShuTi", fontWeight: 400, fontStyle: "normal" },
  { label: "思源黑体 Heavy", family: "Source Han Sans SC Heavy", fontWeight: 900, fontStyle: "normal" },
  { label: "得意黑 斜体", family: "Smiley Sans Oblique", fontWeight: 400, fontStyle: "italic" },
  { label: "方正舒体", family: "FZShuTi", fontWeight: 400, fontStyle: "normal" },
  { label: "无效字体", family: "Broken, fallback", fontWeight: 400, fontStyle: "normal" }
]);

assert(options.length === 3, "deduplicates valid mapped font faces and rejects fallback lists");
assert(options.some((option) => option.label === "方正舒体" && option.family === "FZShuTi"), "maps Chinese labels to CSS families");
assert(options.some((option) => option.label === "思源黑体 Heavy" && option.fontWeight === 900), "preserves font weight");
assert(options.some((option) => option.label === "得意黑 斜体" && option.fontStyle === "italic"), "preserves italic style");

console.log(JSON.stringify({ ok: true, electronFontOptions: options.length }, null, 2));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
