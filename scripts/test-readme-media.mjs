import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const readmes = {
  "README.md": ["zh-CN.single.webp", "zh-CN.bilingual.webp"],
  "README.zh-TW.md": ["zh-TW.single.webp", "zh-TW.bilingual.webp"],
  "README.en.md": ["en.single.webp", "en.bilingual.webp"],
  "README.fr.md": ["fr.single.webp", "fr.bilingual.webp"],
  "README.ja.md": ["ja.single.webp", "ja.bilingual.webp"],
  "README.es.md": ["es.single.webp", "es.bilingual.webp"]
};

const expectedAssets = new Set(Object.values(readmes).flat());
for (const [readme, expected] of Object.entries(readmes)) {
  const text = await readFile(path.join(root, readme), "utf8");
  assert.ok(!text.includes("\uFFFD"), `${readme} contains a replacement character`);
  const references = [...text.matchAll(/docs\/readme-assets\/cards\/([^"')\s]+)/g)].map((match) => match[1]);
  assert.deepEqual(references, expected, `${readme} must reference exactly its two localized cards`);
  assert.equal((text.match(/valign="top"/g) ?? []).length, 2, `${readme} keeps each caption attached to its card`);
}

for (const file of expectedAssets) {
  const filePath = path.join(root, "docs", "readme-assets", "cards", file);
  const fileStat = await stat(filePath);
  assert.ok(fileStat.size > 100_000 && fileStat.size < 1_000_000, `${file} has an unexpected file size`);
  const image = await sharp(filePath).metadata();
  assert.equal(image.format, "webp", `${file} must be WebP`);
  assert.ok(image.width && image.height && image.height >= image.width * 1.1, `${file} must be clearly portrait`);
}

const coverPath = path.join(root, "docs", "readme-assets", "source", "galaxy-cover.webp");
const cover = await sharp(coverPath).metadata();
assert.equal(cover.format, "webp");
assert.equal(cover.width, cover.height, "the generated cover source must remain square");

const generator = await readFile(path.join(root, "scripts", "generate-readme-media.mjs"), "utf8");
assert.match(generator, /const lineHeight = 1\.7;/);
assert.match(generator, /ensureSwitch\(switches\.nth\(0\), true\)/);
assert.match(generator, /ensureSwitch\(switches\.nth\(1\), true\)/);

process.stdout.write(`README media checks passed for ${Object.keys(readmes).length} locales and ${expectedAssets.size} cards.\n`);
