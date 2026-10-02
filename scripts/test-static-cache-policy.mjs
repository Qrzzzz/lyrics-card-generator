import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import nextConfig from "../next.config.mjs";
import { fontVersion, versionFontReferences } from "./lib/font-cache-versions.mjs";

const rules = await nextConfig.headers();
const bySource = new Map(rules.map((rule) => [rule.source, new Map(rule.headers.map((header) => [header.key, header.value]))]));
const immutable = "public, max-age=31536000, immutable";

for (const source of ["/_next/static/:path*", "/fonts/:path*", "/app-icon.png"]) {
  assert.equal(bySource.get(source)?.get("Cache-Control"), immutable, `${source} is content-addressed and immutable`);
}
const contentSecurityPolicy = bySource.get("/:path*")?.get("Content-Security-Policy") ?? "";
assert.match(contentSecurityPolicy, /default-src 'self'/);
assert.match(contentSecurityPolicy, /connect-src 'self' blob: https:/, "local object URLs remain exportable under CSP");
assert.match(contentSecurityPolicy, /object-src 'none'/);

const [globalsSource, staticAssetsSource, readinessSource] = await Promise.all([
  readFile("app/globals.css", "utf8"),
  readFile("lib/static-assets.ts", "utf8"),
  readFile("app/api/desktop-ready/route.ts", "utf8")
]);
assert.equal(globalsSource, await versionFontReferences(globalsSource), "every font URL matches current content");
assert.ok([...globalsSource.matchAll(/url\("\/fonts\//g)].length >= 7, "all registered fonts are enumerated");
assert.notEqual(fontVersion(Buffer.from("font-before")), fontVersion(Buffer.from("font-after")), "a font content mutation changes its cache key");
const fixtureRoot = await mkdtemp(path.join(tmpdir(), "lyrics-font-version-"));
try {
  await mkdir(path.join(fixtureRoot, "public", "fonts"), { recursive: true });
  const fontFile = path.join(fixtureRoot, "public", "fonts", "fixture.woff2");
  const css = 'src: url("/fonts/fixture.woff2")';
  const rootUrl = pathToFileURL(`${fixtureRoot}${path.sep}`);
  await writeFile(fontFile, "font-before");
  const before = await versionFontReferences(css, rootUrl);
  await writeFile(fontFile, "font-after");
  const after = await versionFontReferences(before, rootUrl);
  assert.notEqual(before, after, "mutating the actual font fixture changes its CSS URL");
  assert.equal(after, await versionFontReferences(after, rootUrl), "version generation is idempotent");
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
const fontRules = rules.filter((rule) => rule.source === "/fonts/:path*");
assert.equal(fontRules[0].headers[0].value, "public, max-age=0, must-revalidate");
assert.equal(fontRules[1].has[0].key, "v");
assert.match(staticAssetsSource, /app-icon\.png\?v=\$\{APP_ICON_SHA256\.slice\(0, 16\)\}/);
assert.match(readinessSource, /dynamic = "force-dynamic"/);
assert.equal((readinessSource.match(/"Cache-Control": "no-store"/g) ?? []).length, 2);
assert.ok(!bySource.has("/api/:path*"), "dynamic API cache contracts remain route-specific");

console.log("Static cache policy tests passed");
