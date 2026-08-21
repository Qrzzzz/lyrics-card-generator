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
  sansLicense: "f55c2d43dd905011515f5e46ba78d180027e314ef8ccaaf53a9e88fe316767cd",
  serifLicense: "9ff5bb567e1b92c801fc1069e5fbf992ff8efccacb9db94e5959a5b3ba9bb903",
  platformIcons: {
    "apple-music.svg": "e17c3c7ad50b7a0b2b7dbade1493518338c76766c0513abd84f615d1c5048153",
    "netease-music.svg": "2b878041ce7199d04cb63085db36c639a688b3dac20d8f6313583d9abe56f038",
    "qq-music.svg": "d3272cc18a0a25217d4026923b67198b6a68c4ed9a1a691dd3b42a2d7d53f1b5",
    "spotify.svg": "ef13ffe390971bc3508b9abb6f1f35ca0185fd9253a87ed4d0911c0af04a1b40"
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
    {
      name: "sans",
      path: "public/fonts/SourceHanSansSC-Heavy.otf",
      sha256: expected.sans,
      licensePath: "public/fonts/LICENSE-SourceHanSans.txt",
      licenseSha256: expected.sansLicense
    },
    {
      name: "serif",
      path: "public/fonts/SourceHanSerifSC-Heavy.otf",
      sha256: expected.serif,
      licensePath: "public/fonts/LICENSE-SourceHanSerif.txt",
      licenseSha256: expected.serifLicense
    }
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
    assert.ok(fs.existsSync(font.licensePath), `${font.path} requires ${font.licensePath}`);
    assert.equal(
      hash(fs.readFileSync(font.licensePath)),
      font.licenseSha256,
      `${font.name} font license matches the reviewed upstream bytes`
    );
    const numGlyphs = readNumGlyphs(bytes);
    for (const [locale, sample] of Object.entries(localeSamples)) {
      for (const character of sample.replaceAll(" ", "")) {
        assert.equal(fontHasCodePoint(bytes, character.codePointAt(0)), true, `${font.name} retains ${locale} glyph ${character}`);
      }
    }
    evidence[font.name] = { bytes: bytes.length, sha256: font.sha256, numGlyphs, localeSamples };
  }

  assert.equal(
    hashNormalizedText(Buffer.from("<svg>\r\n</svg>\r\n")),
    hashNormalizedText(Buffer.from("<svg>\n</svg>\n")),
    "SVG fingerprints ignore Git working-tree line endings"
  );
  for (const [name, sha256] of Object.entries(expected.platformIcons)) {
    assert.equal(
      hashNormalizedText(fs.readFileSync(path.join("public", "platform-icons", name))),
      sha256,
      `${name} remains content-identical across Git line-ending conversion`
    );
  }

  const distributionFiles = [
    "app-icon.png",
    "fonts/SourceHanSansSC-Heavy.otf",
    "fonts/LICENSE-SourceHanSans.txt",
    "fonts/SourceHanSerifSC-Heavy.otf",
    "fonts/LICENSE-SourceHanSerif.txt",
    ...Object.keys(expected.platformIcons).map((name) => `platform-icons/${name}`)
  ];
  const stagedPublic = path.join("dist-desktop", "server", "public");
  if (process.argv.includes("--staged") || process.argv.includes("--packaged")) {
    assertDistributionMatchesSource(stagedPublic, "staged", distributionFiles);
  }

  const packagedPublic = path.join("release", "win-unpacked", "resources", "server", "public");
  if (process.argv.includes("--packaged")) {
    assertDistributionMatchesSource(packagedPublic, "packaged", distributionFiles);
  }

  console.log(JSON.stringify({ ok: true, appIconBytes: publicIcon.length, appIconPixelSha256: expected.appIconPixels, fonts: evidence }, null, 2));
}

function assertDistributionMatchesSource(distributionPublic, label, relativePaths) {
  assert.ok(fs.existsSync(distributionPublic), `${label} public assets must exist`);
  for (const relativePath of relativePaths) {
    assert.ok(
      fs.readFileSync(path.join(distributionPublic, ...relativePath.split("/"))).equals(
        fs.readFileSync(path.join("public", ...relativePath.split("/")))
      ),
      `${label} ${relativePath} matches the reviewed source bytes`
    );
  }
}

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hashNormalizedText(bytes) {
  return hash(Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8"));
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
