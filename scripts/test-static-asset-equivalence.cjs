const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const expected = {
  appIconFile: "b3e613afa7695f7fe9b2b72ab8681647d37dc3a210292bce48b80d96b9daaf58",
  appIconPixels: "6bbb6bd7114354e31fd4bff7138337ce0eae09ceaaa8d3aeaba19c17526d9870",
  sans: "4a8b2ee4f041fa56c7a5561f36e13ed6780eec66161c30274fc90b0c5ba7cea2",
  serif: "d033af54f96530476faed924ab5d5e9e6ef0833495670fd57bab9a7758398048",
  platformIcons: {
    "apple-music.svg": "9e30c6faf50ad655bef28208c671276e2b817bda772ba9bc2ecc1d59307a3e2e",
    "netease-music.svg": "c9b9a593aedd797e17ba6c8a21c1cdfc3dd3730c60a88e3b78e418d81c159fa7",
    "qq-music.svg": "d3272cc18a0a25217d4026923b67198b6a68c4ed9a1a691dd3b42a2d7d53f1b5",
    "spotify.svg": "05ac0e0e8cc7ce903cd92f597de74bac182af6450652f1a5a4a477d889dc02fc"
  }
};

async function run() {
  const publicIcon = fs.readFileSync("public/app-icon.png");
  const metadataIcon = fs.readFileSync("app/icon.png");
  assert.equal(hash(publicIcon), expected.appIconFile);
  assert.ok(publicIcon.equals(metadataIcon), "desktop/About/Web Lite decode the same optimized PNG bytes");
  const { data: pixels, info } = await sharp(publicIcon).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height, channels: info.channels }, { width: 1024, height: 1024, channels: 4 });
  assert.equal(hash(pixels), expected.appIconPixels, "lossless PNG recompression preserves every decoded RGBA pixel");

  const fonts = [
    { name: "sans", path: "public/fonts/SourceHanSansSC-Heavy.otf", sha256: expected.sans },
    { name: "serif", path: "public/fonts/SourceHanSerifSC-Heavy.otf", sha256: expected.serif }
  ];
  const localeSamples = {
    zh: "歌词分享图片",
    "zh-TW": "歌詞分享圖片",
    en: "Lyrics Card",
    fr: "Élève français",
    ja: "歌詞と旅路",
    es: "Canción española",
    rare: "𠮷髙神"
  };
  const evidence = {};
  for (const font of fonts) {
    const bytes = fs.readFileSync(font.path);
    assert.equal(hash(bytes), font.sha256, `${font.name} font bytes stay identical to the six-locale baseline`);
    const numGlyphs = readNumGlyphs(bytes);
    for (const [locale, sample] of Object.entries(localeSamples)) {
      for (const character of sample.replaceAll(" ", "")) {
        assert.equal(fontHasCodePoint(bytes, character.codePointAt(0)), true, `${font.name} retains ${locale} glyph ${character}`);
      }
    }
    evidence[font.name] = { bytes: bytes.length, sha256: font.sha256, numGlyphs, localeSamples };
  }

  for (const [name, sha256] of Object.entries(expected.platformIcons)) {
    assert.equal(hash(fs.readFileSync(path.join("public", "platform-icons", name))), sha256, `${name} remains byte-identical`);
  }

  const packagedPublic = path.join("release", "win-unpacked", "resources", "server", "public");
  if (process.argv.includes("--packaged")) {
    assert.ok(fs.existsSync(packagedPublic), "packaged public assets must exist for --packaged verification");
    for (const relativePath of [
      "app-icon.png",
      "fonts/SourceHanSansSC-Heavy.otf",
      "fonts/SourceHanSerifSC-Heavy.otf",
      ...Object.keys(expected.platformIcons).map((name) => `platform-icons/${name}`)
    ]) {
      assert.ok(
        fs.readFileSync(path.join(packagedPublic, ...relativePath.split("/"))).equals(fs.readFileSync(path.join("public", ...relativePath.split("/")))),
        `packaged ${relativePath} matches the reviewed source bytes`
      );
    }
  }

  console.log(JSON.stringify({ ok: true, appIconBytes: publicIcon.length, appIconPixelSha256: expected.appIconPixels, fonts: evidence }, null, 2));
}

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function getTable(font, tag) {
  const numTables = font.readUInt16BE(4);
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (font.toString("ascii", record, record + 4) === tag) {
      const offset = font.readUInt32BE(record + 8);
      const length = font.readUInt32BE(record + 12);
      assert.ok(offset + length <= font.length, `${tag} table is bounded by the font file`);
      return { offset, length };
    }
  }
  throw new Error(`Missing OpenType table ${tag}`);
}

function readNumGlyphs(font) {
  const table = getTable(font, "maxp");
  return font.readUInt16BE(table.offset + 4);
}

function fontHasCodePoint(font, codePoint) {
  const cmap = getTable(font, "cmap");
  const subtableCount = font.readUInt16BE(cmap.offset + 2);
  const subtables = [];
  for (let index = 0; index < subtableCount; index += 1) {
    const record = cmap.offset + 4 + index * 8;
    const offset = cmap.offset + font.readUInt32BE(record + 4);
    const format = font.readUInt16BE(offset);
    if (format === 12 || format === 4) subtables.push({ format, offset });
  }
  subtables.sort((left, right) => right.format - left.format);
  return subtables.some((subtable) => (
    subtable.format === 12
      ? format12HasCodePoint(font, subtable.offset, codePoint)
      : format4HasCodePoint(font, subtable.offset, codePoint)
  ));
}

function format12HasCodePoint(font, offset, codePoint) {
  const groupCount = font.readUInt32BE(offset + 12);
  let low = 0;
  let high = groupCount - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const group = offset + 16 + middle * 12;
    const start = font.readUInt32BE(group);
    const end = font.readUInt32BE(group + 4);
    if (codePoint < start) high = middle - 1;
    else if (codePoint > end) low = middle + 1;
    else return font.readUInt32BE(group + 8) + codePoint - start !== 0;
  }
  return false;
}

function format4HasCodePoint(font, offset, codePoint) {
  if (codePoint > 0xffff) return false;
  const segmentCount = font.readUInt16BE(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segmentCount * 2 + 2;
  const deltas = startCodes + segmentCount * 2;
  const rangeOffsets = deltas + segmentCount * 2;
  for (let index = 0; index < segmentCount; index += 1) {
    const end = font.readUInt16BE(endCodes + index * 2);
    if (codePoint > end) continue;
    const start = font.readUInt16BE(startCodes + index * 2);
    if (codePoint < start) return false;
    const delta = font.readInt16BE(deltas + index * 2);
    const rangeOffset = font.readUInt16BE(rangeOffsets + index * 2);
    if (rangeOffset === 0) return ((codePoint + delta) & 0xffff) !== 0;
    const glyphAddress = rangeOffsets + index * 2 + rangeOffset + (codePoint - start) * 2;
    if (glyphAddress + 2 > font.length) return false;
    const glyph = font.readUInt16BE(glyphAddress);
    return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
  }
  return false;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
