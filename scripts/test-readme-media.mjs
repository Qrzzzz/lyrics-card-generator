import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const readmes = {
  "README.md": { cards: ["zh-CN.single.webp", "zh-CN.bilingual.webp"], screenshot: "step-3.zh-CN.webp" },
  "README.zh-TW.md": { cards: ["zh-TW.single.webp", "zh-TW.bilingual.webp"], screenshot: "step-3.zh-TW.webp" },
  "README.en.md": { cards: ["en.single.webp", "en.bilingual.webp"], screenshot: "step-3.en.webp" },
  "README.fr.md": { cards: ["fr.single.webp", "fr.bilingual.webp"], screenshot: "step-3.fr.webp" },
  "README.ja.md": { cards: ["ja.single.webp", "ja.bilingual.webp"], screenshot: "step-3.ja.webp" },
  "README.es.md": { cards: ["es.single.webp", "es.bilingual.webp"], screenshot: "step-3.es.webp" }
};

const expectedCards = new Set(Object.values(readmes).flatMap(({ cards }) => cards));
const expectedScreenshots = new Set(Object.values(readmes).map(({ screenshot }) => screenshot));
for (const [readme, expected] of Object.entries(readmes)) {
  const text = await readFile(path.join(root, readme), "utf8");
  assert.ok(!text.includes("\uFFFD"), `${readme} contains a replacement character`);
  const cardReferences = [...text.matchAll(/docs\/readme-assets\/cards\/([^"')\s]+)/g)].map((match) => match[1]);
  const screenshotReferences = [...text.matchAll(/docs\/readme-assets\/screenshots\/([^"')\s]+)/g)].map((match) => match[1]);
  assert.deepEqual(cardReferences, expected.cards, `${readme} must reference exactly its two localized cards`);
  assert.deepEqual(screenshotReferences, [expected.screenshot], `${readme} must reference its localized interface screenshot`);

  const galleryStart = text.indexOf("<details>");
  const galleryEnd = text.indexOf("./public/app-icon.png", galleryStart);
  assert.ok(galleryStart >= 0 && galleryEnd > galleryStart, `${readme} must keep its media galleries before the app introduction`);
  const galleryRegion = text.slice(galleryStart, galleryEnd);
  const galleryDetails = [...galleryRegion.matchAll(/<details([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.equal(galleryDetails.length, 2, `${readme} must expose two independent media folds`);
  assert.equal(galleryDetails[0][1].trim(), "", `${readme} interface fold must be collapsed by default`);
  assert.equal(galleryDetails[1][1].trim(), "", `${readme} output fold must be collapsed by default`);
  assert.ok(galleryDetails[0][2].includes(expected.screenshot), `${readme} keeps the interface screenshot in the first fold`);
  for (const card of expected.cards) {
    assert.ok(galleryDetails[1][2].includes(card), `${readme} keeps ${card} in the output fold`);
  }
  assert.equal((galleryRegion.match(/valign="top"/g) ?? []).length, 3, `${readme} keeps each caption attached to its image`);
}

for (const file of expectedCards) {
  const filePath = path.join(root, "docs", "readme-assets", "cards", file);
  const fileStat = await stat(filePath);
  assert.ok(fileStat.size > 100_000 && fileStat.size < 1_000_000, `${file} has an unexpected file size`);
  const image = await sharp(filePath).metadata();
  assert.equal(image.format, "webp", `${file} must be WebP`);
  assert.ok(image.width && image.height && image.height >= image.width * 1.1, `${file} must be clearly portrait`);
}

for (const file of expectedScreenshots) {
  const filePath = path.join(root, "docs", "readme-assets", "screenshots", file);
  const fileStat = await stat(filePath);
  assert.ok(fileStat.size > 40_000 && fileStat.size < 200_000, `${file} has an unexpected file size`);
  const image = await sharp(filePath).metadata();
  assert.equal(image.format, "webp", `${file} must be WebP`);
  assert.ok(image.width && image.width >= 1_400, `${file} must retain a readable desktop width`);
  assert.ok(image.height && image.height >= 850, `${file} must retain a readable desktop height`);
  assert.ok(Math.abs(image.width / image.height - 1.6) < 0.03, `${file} must remain close to 16:10`);
}

const coverPath = path.join(root, "docs", "readme-assets", "source", "galaxy-cover.webp");
const cover = await sharp(coverPath).metadata();
assert.equal(cover.format, "webp");
assert.equal(cover.width, cover.height, "the generated cover source must remain square");

const generator = await readFile(path.join(root, "scripts", "generate-readme-media.mjs"), "utf8");
assert.match(generator, /const lineHeight = 1\.7;/);
assert.match(generator, /ensureSwitch\(switches\.nth\(0\), true\)/);
assert.match(generator, /ensureSwitch\(switches\.nth\(1\), true\)/);

process.stdout.write(
  `README media checks passed for ${Object.keys(readmes).length} locales, ${expectedCards.size} cards, and ${expectedScreenshots.size} interface screenshots.\n`
);
