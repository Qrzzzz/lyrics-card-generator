import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { buildWebLite } from "./build-web-lite.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "lyrics-card-web-lite-"));
const temporaryOutput = path.join(temporaryDirectory, "index.html");

try {
  await buildWebLite(temporaryOutput);
  const [generated, committed, lyricInputSource, visualPanelSource, exportPanelSource, webLiteEditorSource] = await Promise.all([
    readFile(temporaryOutput, "utf8"),
    readFile(path.join(projectRoot, "index.html"), "utf8"),
    readFile(path.join(projectRoot, "components", "editor", "LyricInput.tsx"), "utf8"),
    readFile(path.join(projectRoot, "components", "editor", "StylePanel.tsx"), "utf8"),
    readFile(path.join(projectRoot, "components", "editor", "ExportPanel.tsx"), "utf8"),
    readFile(path.join(projectRoot, "web-lite", "WebLiteEditor.tsx"), "utf8")
  ]);

  if (generated !== committed) {
    throw new Error("index.html is stale. Run npm run web-lite:build and commit the generated file.");
  }

  const requiredFragments = [
    "GENERATED FILE",
    '<div id="web-lite-root"></div>',
    "./public/app-icon.png",
    "./public/fonts/SourceHanSansSC-Heavy.otf",
    "./public/fonts/SourceHanSerifSC-Heavy.otf"
  ];
  for (const fragment of requiredFragments) {
    if (!generated.includes(fragment)) {
      throw new Error(`Generated Web Lite HTML is missing required fragment: ${fragment}`);
    }
  }

  const forbiddenFragments = ["/_next/", "/api/", "http://localhost", "https://localhost", "http://127.0.0.1"];
  for (const fragment of forbiddenFragments) {
    if (generated.includes(fragment)) {
      throw new Error(`Generated Web Lite HTML contains a forbidden runtime dependency: ${fragment}`);
    }
  }

  if (
    generated.indexOf("<style>") < 0 ||
    generated.indexOf("</style>") < 0 ||
    generated.indexOf("<script>") < 0 ||
    generated.indexOf("</script>") < 0 ||
    /<script\s+[^>]*src=/i.test(generated) ||
    /<link\s+[^>]*rel=["']stylesheet["']/i.test(generated)
  ) {
    throw new Error("Generated Web Lite HTML must inline its application style and script.");
  }

  if (generated.includes("/* WEB_LITE_STYLES */") || generated.includes("/* WEB_LITE_SCRIPT */")) {
    throw new Error("Generated Web Lite HTML still contains an unreplaced template marker.");
  }

  const inlineScript = generated.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  if (!inlineScript?.trim()) {
    throw new Error("Generated Web Lite HTML does not contain a non-empty inline application script.");
  }
  try {
    new Script(inlineScript, { filename: "web-lite-inline.js" });
  } catch (error) {
    throw new Error(
      `Generated Web Lite inline script is invalid JavaScript: ${error instanceof Error ? error.message : error}`
    );
  }

  const sourceContracts = [
    [lyricInputSource, "showAiTranslate = true", "LyricInput must keep AI visible by default."],
    [visualPanelSource, "showPlatformBadgeControl = true", "VisualSettingsPanel must keep the platform control by default."],
    [exportPanelSource, 'qualityOptions = ["low", "medium", "high"]', "ExportPanel must keep all desktop qualities by default."],
    [webLiteEditorSource, "showAiTranslate={false}", "Web Lite must hide AI translation."],
    [webLiteEditorSource, "showPlatformBadgeControl={false}", "Web Lite must hide the platform badge control."],
    [webLiteEditorSource, "qualityOptions={EXPORT_QUALITY_OPTIONS}", "Web Lite must provide only its approved export qualities."]
  ];
  for (const [source, fragment, message] of sourceContracts) {
    if (!source.includes(fragment)) {
      throw new Error(message);
    }
  }

  console.log("Web Lite generated artifact is current and self-contained apart from approved public assets.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
