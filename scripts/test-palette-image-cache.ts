import assert from "node:assert/strict";
import { analyzeCoverImage, DEFAULT_PALETTE } from "../lib/palette-extraction";

// Exercise the decode/cache boundary without network, DOM timing or real image codecs.
const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalNow = Date.now;
const originalWarn = console.warn;
let now = 1000;
const loads = new Map<string, number>();
class FixtureImage {
  naturalWidth = 2;
  naturalHeight = 2;
  crossOrigin = "";
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  set src(value: string) {
    const count = (loads.get(value) ?? 0) + 1;
    loads.set(value, count);
    queueMicrotask(() => {
      if (value === "fixture:retry" && count === 1) this.onerror?.(new Event("error"));
      else this.onload?.(new Event("load"));
    });
  }
}
Object.defineProperty(globalThis, "Image", { configurable: true, value: FixtureImage });
Object.defineProperty(globalThis, "document", { configurable: true, value: {
  createElement: () => ({ width: 2, height: 2, getContext: () => ({
    drawImage: () => undefined,
    getImageData: () => ({ data: Uint8ClampedArray.from(Array.from({ length: 4 }, () => [30, 110, 210, 255]).flat()) })
  }) })
} });
Date.now = () => now;
console.warn = () => undefined;

async function main() {
  try {
    const [first, concurrent] = await Promise.all([analyzeCoverImage("fixture:one"), analyzeCoverImage("fixture:one")]);
    assert.equal(first, concurrent, "concurrent consumers share one decode");
    assert.equal(loads.get("fixture:one"), 1);
    assert.equal(await analyzeCoverImage("fixture:one"), first, "recent successful analysis is reused");
    now += 60001;
    assert.notEqual(await analyzeCoverImage("fixture:one"), first, "expired results are refreshed");
    assert.equal(loads.get("fixture:one"), 2);
    assert.equal((await analyzeCoverImage("fixture:retry")).palette, DEFAULT_PALETTE);
    assert.notEqual((await analyzeCoverImage("fixture:retry")).palette, DEFAULT_PALETTE, "failed analysis is retryable");
    assert.equal(loads.get("fixture:retry"), 2);
    for (let i = 0; i < 8; i++) await analyzeCoverImage(`fixture:bounded-${i}`);
    await analyzeCoverImage("fixture:one");
    assert.equal(loads.get("fixture:one"), 3, "the cache evicts old covers at its eight-result limit");
    console.log("Cover analysis cache: concurrent decode, expiry, failure retry and bounded eviction passed.");
  } finally {
    if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
    else Reflect.deleteProperty(globalThis, "Image");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    Date.now = originalNow;
    console.warn = originalWarn;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
