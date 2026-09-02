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
import { settingsCopy } from "../lib/settings/copy";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const portrait = load(renderToStaticMarkup(<ProjectSignature color="#F8FAFC" />));
const portraitSignature = portrait("[data-project-signature]");

assert.equal(portraitSignature.text(), PROJECT_SIGNATURE_TEXT, "the signature is one continuous repository slug");
assert.equal(portraitSignature.attr("aria-label"), PROJECT_SIGNATURE_TEXT, "the signature exposes one accessible label");
assert.equal(portraitSignature.children().length, 2, "owner and repository remain the only visual parts");
assert.equal(portraitSignature.find("div").length, 0, "the signature has no decorative divider lines");
assert.match(
  portraitSignature.attr("style") ?? "",
  /font-family:Inter, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif/
);
assert.doesNotMatch(portraitSignature.attr("style") ?? "", /Bahnschrift/);
assert.match(portraitSignature.attr("style") ?? "", /font-size:26px/);
assert.match(portraitSignature.attr("style") ?? "", /font-stretch:normal/);
assert.match(portraitSignature.attr("style") ?? "", /font-weight:400/);
assert.match(portraitSignature.attr("style") ?? "", /letter-spacing:0\.02em/);
assert.match(portraitSignature.attr("style") ?? "", /line-height:1\.15/);
assert.equal(portrait("[data-project-signature-owner]").attr("style"), "opacity:0.72", "owner uses the stronger alpha");
assert.equal(
  portrait("[data-project-signature-repository]").attr("style"),
  "opacity:0.52",
  "repository uses the quieter alpha"
);

const portraitFooter = load(renderToStaticMarkup(
  <CardFooter
    showPlatformLogo={false}
    platformSource="unknown"
    showGeneratedWatermark
    showSharedBy
    sharedByText="Shared by Test"
    textColor="#F8FAFC"
  />
));
assert.match(portraitFooter("footer").attr("class") ?? "", /(?:^|\s)gap-\[14px\](?:\s|$)/, "portrait footer uses a compact 14px row gap");
assert.equal(portraitFooter("[data-project-signature]").length, 1, "portrait footer renders the project signature");

const landscape = load(renderToStaticMarkup(
  <LandscapeAccessories
    source="unknown"
    showPlatformBadge={false}
    showSharedBy
    sharedByText="Shared by Test"
    showGeneratedWatermark
    textColor="#F8FAFC"
    scale={1.25}
  />
));
const landscapeSignature = landscape("[data-project-signature]");
assert.match(landscapeSignature.attr("style") ?? "", /font-size:37\.5px/, "landscape typography follows the scale system");
assert.equal(landscapeSignature.parent().attr("style"), "margin-top:20px", "landscape accessories keep a scaled 16px signature gap");

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
