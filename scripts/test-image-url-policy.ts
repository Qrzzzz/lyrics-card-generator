import assert from "node:assert/strict";
import { MAX_INLINE_COVER_BYTES, proxiedImageUrl } from "../lib/image-utils";

const origin = "http://127.0.0.1:43127";
const proxy = (url: string) => "/api/image-proxy?url=" + encodeURIComponent(url);
for (const url of [
  "https://localhost.attacker.example/large.png",
  "https://127.0.0.1.attacker.example/large.png",
  "https://example.com/cover.png",
  "http://localhost:43128/cover.png"
]) assert.equal(proxiedImageUrl(url, origin), proxy(url));
assert.equal(proxiedImageUrl("//attacker.example/large.png", origin), proxy("http://attacker.example/large.png"));
for (const url of ["file:///C:/private.png", "filesystem:https://example.com/x", "javascript:alert(1)",
  "https://localhost@attacker.example/x", "/\\\\attacker.example/x", "https://example.com/\ncover",
  "blob:https://attacker.example/id", "data:text/html;base64,YWJj", "data:image/svg+xml;base64,YWJj",
  "data:image/png;base64,abc", "http://["]) assert.equal(proxiedImageUrl(url, origin), "", url);
for (const url of ["/covers/local.png", origin + "/covers/local.png", "blob:" + origin + "/id"])
  assert.equal(proxiedImageUrl(url, origin), url);
assert.equal(proxiedImageUrl("https://localhost:443/x", "https://localhost"), "https://localhost:443/x");
const atLimit = "data:image/png;base64," + Buffer.alloc(MAX_INLINE_COVER_BYTES).toString("base64");
assert.equal(proxiedImageUrl(atLimit, origin), atLimit);
assert.equal(proxiedImageUrl("data:image/png;base64," + Buffer.alloc(MAX_INLINE_COVER_BYTES + 1).toString("base64"), origin), "");
assert.equal(proxiedImageUrl("data:image/png;base64,YWJj", origin), "data:image/png;base64,YWJj");
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
assert.equal(proxiedImageUrl("https://example.com/cover.png"), proxy("https://example.com/cover.png"));
if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
else Reflect.deleteProperty(globalThis, "window");
// These are routing assertions. Remote DNS, redirect, media-type and size
// enforcement belongs to safeFetch; CSP/CORS may independently reject loading.
console.log("image URL policy: proxy routing, exact origins, local uploads and inline budget passed");
