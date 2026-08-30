import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nextConfig from "../next.config.mjs";

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
assert.match(globalsSource, /SourceHanSansSC-Heavy\.otf\?v=4a8b2ee4f041fa56/);
assert.match(globalsSource, /SourceHanSerifSC-Heavy\.otf\?v=d033af54f9653047/);
assert.match(staticAssetsSource, /app-icon\.png\?v=\$\{APP_ICON_SHA256\.slice\(0, 16\)\}/);
assert.match(readinessSource, /dynamic = "force-dynamic"/);
assert.equal((readinessSource.match(/"Cache-Control": "no-store"/g) ?? []).length, 2);
assert.ok(!bySource.has("/api/:path*"), "dynamic API cache contracts remain route-specific");

console.log("Static cache policy tests passed");
