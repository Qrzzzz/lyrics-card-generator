import assert from "node:assert/strict";
import { load } from "cheerio";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultState } from "../components/editor/editor-defaults";
import { CardFooter } from "../components/preview/CardFooter";
import { LandscapeAccessories } from "../components/preview/LandscapeAccessories";
import { ProjectSignature } from "../components/preview/ProjectSignature";
import { messages } from "../lib/i18n";
import { PROJECT_SIGNATURE_TEXT } from "../lib/project-signature";
import { getPortraitLayout } from "../lib/card-layout-engine";
import { settingsCopy } from "../lib/settings/copy";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const portrait = load(renderToStaticMarkup(<ProjectSignature color="#F8FAFC" />));
const portraitSignature = portrait("[data-project-signature]");

assert.equal(portraitSignature.text(), PROJECT_SIGNATURE_TEXT, "the signature is one continuous repository slug");
assert.equal(portraitSignature.attr("aria-label"), PROJECT_SIGNATURE_TEXT, "the signature exposes one accessible label");
assert.equal(portraitSignature.children().length, 2, "owner and repository remain the only visual parts");
assert.equal(portraitSignature.find("div").length, 0, "the signature has no decorative divider lines");
assert.match(portraitSignature.attr("style") ?? "", /font-family:inherit/);
assert.match(portraitSignature.attr("style") ?? "", /font-size:26px/);
assert.match(portraitSignature.attr("class") ?? "", /text-left/);

for (const variant of ["portrait", "landscape"] as const) {
  for (const showSharedBy of [false, true]) {
    for (const showGeneratedWatermark of [false, true]) {
      const Component = variant === "portrait" ? CardFooter : LandscapeAccessories;
      const footer = load(renderToStaticMarkup(<Component
        showSharedBy={showSharedBy} sharedByText="Shared by Test"
        showGeneratedWatermark={showGeneratedWatermark} textColor="#F8FAFC"
      />));
      assert.equal(footer("footer").length, Number(showSharedBy || showGeneratedWatermark));
      assert.equal(footer("img").length, 0, "credits never render platform imagery");
      assert.equal(footer("[data-card-shared-by]").length, Number(showSharedBy));
      assert.equal(footer("[data-project-signature]").length, Number(showGeneratedWatermark));
      if (showSharedBy) assert.match(footer("[data-card-shared-by]").attr("class") ?? "", /text-right/);
      if (showSharedBy && showGeneratedWatermark) {
        assert.equal(footer("footer").children().first().attr("data-card-shared-by"), "true");
        assert.equal(footer("footer").children().last().attr("data-project-signature"), "true");
      }
    }
  }
}
assert.equal(renderToStaticMarkup(<CardFooter showSharedBy sharedByText="  " showGeneratedWatermark={false} textColor="#fff" />), "");
const landscape = load(renderToStaticMarkup(<LandscapeAccessories
  showSharedBy sharedByText="Test" showGeneratedWatermark textColor="#fff" scale={1.25}
/>));
assert.match(landscape("[data-project-signature]").attr("style") ?? "", /font-size:37\.5px/);

for (const align of ["left", "center"] as const) {
  const layout = getPortraitLayout({ width: 1080, height: 1440 }, {
    ...defaultState.style, align, showGeneratedWatermark: true
  });
  assert.equal(layout.footerRect?.x, layout.lyricsRect.x);
  assert.equal(layout.footerRect?.width, layout.lyricsRect.width);
}
const legacyStyle = { ...defaultState.style, showPlatformBadge: true, showSharedBy: false,
  showGeneratedWatermark: false, showWatermark: false };
assert.equal(getPortraitLayout({ width: 1080, height: 1440 }, legacyStyle, "spotify").footerRect, undefined,
  "legacy platform settings reserve no footer space");

assert.equal(defaultState.style.watermark, PROJECT_SIGNATURE_TEXT, "new documents retain the canonical signature text");
assert.deepEqual(
  {
    zh: messages.zh.showGeneratedWatermark,
    en: messages.en.showGeneratedWatermark,
    fr: messages.fr.showGeneratedWatermark,
    ja: messages.ja.showGeneratedWatermark,
    es: messages.es.showGeneratedWatermark
  },
  {
    zh: "显示项目署名",
    en: "Show project signature",
    fr: "Afficher la signature du projet",
    ja: "プロジェクト署名を表示",
    es: "Mostrar firma del proyecto"
  },
  "the editor label describes a project signature in every authored locale"
);
assert.equal(settingsCopy.en.defaultGeneratedWatermark, "Project signature");
assert.equal(settingsCopy.zh.defaultGeneratedWatermark, "项目署名");
assert.equal(settingsCopy["zh-TW"].defaultGeneratedWatermark, "專案署名");
for (const locale of Object.keys(messages)) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(messages[locale as keyof typeof messages], "landscapeHeightFloorHint"),
    false,
    `${locale} no longer exposes the removed landscape auto-height hint`
  );
}

console.log("project signature component, layout, defaults, and copy checks passed");
