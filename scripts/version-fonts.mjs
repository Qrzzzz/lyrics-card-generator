import { readFile, writeFile } from "node:fs/promises";
import { versionFontReferences } from "./lib/font-cache-versions.mjs";

const file = new URL("../app/globals.css", import.meta.url);
const source = await readFile(file, "utf8");
const versioned = await versionFontReferences(source);
if (process.argv.includes("--check")) {
  if (source !== versioned) throw new Error("Font content changed: run npm run fonts:version before building.");
} else if (source !== versioned) {
  await writeFile(file, versioned);
}
