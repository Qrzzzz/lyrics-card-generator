import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function fontVersion(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export async function versionFontReferences(css, root = new URL("../../", import.meta.url)) {
  const references = [...css.matchAll(/\/fonts\/([^"\s)?]+)(?:\?v=[a-f0-9]+)?/g)];
  for (const [reference, file] of references) {
    const bytes = await readFile(new URL(`public/fonts/${file}`, root));
    css = css.replaceAll(reference, `/fonts/${file}?v=${fontVersion(bytes)}`);
  }
  return css;
}
