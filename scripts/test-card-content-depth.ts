import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CARD_ARTWORK_BOX_SHADOW,
  CARD_ARTWORK_DROP_SHADOW,
  resolveCardContentTextShadow
} from "../lib/card-content-depth";

const portraitCard = readFileSync(resolve("components/preview/LyricCard.tsx"), "utf8");
const landscapeCard = readFileSync(resolve("components/preview/LandscapeLyricCard.tsx"), "utf8");
const instrumentalBlock = readFileSync(resolve("components/preview/InstrumentalBlock.tsx"), "utf8");
const fontSchemePanel = readFileSync(resolve("components/editor/font-scheme/FontSchemePanel.tsx"), "utf8");
const productionCards = `${portraitCard}\n${landscapeCard}`;
const previewSources = [
  portraitCard,
  landscapeCard,
  instrumentalBlock,
  readFileSync(resolve("components/preview/LyricsBlock.tsx"), "utf8"),
  readFileSync(resolve("components/preview/LandscapeLyricsContent.tsx"), "utf8"),
  readFileSync(resolve("components/preview/LandscapeSongMetadata.tsx"), "utf8")
].join("\n");

assert.doesNotMatch(productionCards, /LocalReadabilityLayer|createCardReadabilityPlan/,
  "portrait and landscape cards do not render broad readability-zone shadows");
assert.equal(
  [...productionCards.matchAll(/resolveCardContentTextShadow\(textColor\)/g)].length,
  2,
  "portrait and landscape content share one restrained text-depth treatment"
);
assert.doesNotMatch(
  previewSources,
  /0 (?:8px 28px|10px 32px|12px 34px|34px 45px|34px 90px)/,
  "legacy broad text and artwork shadows stay removed from card rendering"
);

assert.equal(resolveCardContentTextShadow("#F8FAFC"), "0 2px 8px rgba(0,0,0,0.20)");
assert.equal(resolveCardContentTextShadow("#111827"), "0 1px 4px rgba(255,255,255,0.12)");
assert.equal(CARD_ARTWORK_DROP_SHADOW, "drop-shadow(0 8px 16px rgba(0,0,0,0.16))");
assert.equal(CARD_ARTWORK_BOX_SHADOW, "0 10px 24px rgba(0,0,0,0.16)");
assert.ok(portraitCard.includes("dropShadow={CARD_ARTWORK_DROP_SHADOW}"));
assert.ok(portraitCard.includes("boxShadow={CARD_ARTWORK_BOX_SHADOW}"));
assert.ok(landscapeCard.includes("dropShadow={CARD_ARTWORK_DROP_SHADOW}"));
assert.ok(landscapeCard.includes("boxShadow={CARD_ARTWORK_BOX_SHADOW}"));
assert.ok(instrumentalBlock.includes("dropShadow={CARD_ARTWORK_DROP_SHADOW}"));
assert.ok(instrumentalBlock.includes("boxShadow={CARD_ARTWORK_BOX_SHADOW}"));
assert.ok(
  fontSchemePanel.includes('<PanelBlock title={t("fontSchemeCustomTitle")} tone="plain">'),
  "the custom scheme no longer sits inside a second panel surface"
);
assert.ok(
  fontSchemePanel.includes('"control-focus grid w-full gap-4 rounded-xl border p-4 text-left transition"'),
  "the custom scheme uses the same single-layer card geometry as the preset cards"
);
assert.ok(
  fontSchemePanel.includes('? "app-border bg-black/10 hover:bg-[rgb(var(--button-bg-hover))]"'),
  "the inactive custom card shares the preset cards' neutral surface"
);

console.log("card content uses restrained per-glyph and artwork depth without broad readability shadows");
