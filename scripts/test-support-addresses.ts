import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import jsQR from "jsqr";
import { SUPPORT_METHODS } from "../lib/settings/support-addresses";
import { createSettingsDestination, getSettingsRouteBreadcrumbs } from "../components/settings/settings-routing";
import { DEFAULT_AI_SETTINGS } from "../lib/ai/types";
import { settingsCopy } from "../lib/settings/copy";
import type { Locale } from "../lib/types";
import { createRequire } from "node:module";

const { createSupportAddressCopier } = createRequire(import.meta.url)("../electron/support-addresses.js") as {
  createSupportAddressCopier: (clipboard: { writeText: (text: string) => void }) => (event: unknown, id: unknown) => boolean;
};

async function main() {
  const writes: string[] = [];
  const copyAddress = createSupportAddressCopier({ writeText: (text: string) => { writes.push(text); } });
  for (const invalid of [null, undefined, {}, ["tron"], "__proto__", "TRON", "xlayer ", "0x8499979b198c97a7c1cc67a8303532f4b8da0059"]) {
    assert.equal(copyAddress(null, invalid), false);
  }
  assert.equal(writes.length, 0, "unrecognized input never reaches the native clipboard");
  for (const method of SUPPORT_METHODS) {
    assert.equal(copyAddress(null, method.id), true);
    assert.equal(writes.at(-1), method.address);
  }
  assert.throws(() => createSupportAddressCopier({ writeText: () => { throw new Error("unavailable"); } })(null, "tron"), /unavailable/);
  assert.deepEqual(SUPPORT_METHODS.map(({ network, address }) => [network, address]), [
    ["TRON", "TNdPVGkb3BtZh6hmmU1jcSdvrhAZqqhw9u"],
    ["X Layer", "0x8499979b198c97a7c1cc67a8303532f4b8da0059"]
  ]);
  for (const method of SUPPORT_METHODS) {
    const svg = readFileSync(`public${method.qr}`);
    // Independent decoder verifies the actual shipped QR, including at display size.
    for (const size of [192, 384]) {
      const { data, info } = await sharp(svg).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      assert.equal(decoded?.data, method.address, `${method.network} QR at ${size}px`);
    }
    const icon = readFileSync(`public${method.icon}`, "utf8");
    assert.doesNotMatch(icon, /<script|<foreignObject|(?:href|src)=|\bon\w+=/i);
  }
  const support = createSettingsDestination("about", ["support"]);
  assert.deepEqual(support.path, ["support"]);
  assert.deepEqual(createSettingsDestination("about", ["support", "bad"]).path, []);
  assert.deepEqual(createSettingsDestination("general", ["support"]).path, []);
  for (const locale of Object.keys(settingsCopy) as Locale[]) {
    const crumbs = getSettingsRouteBreadcrumbs(support, settingsCopy[locale].about, { locale, settings: DEFAULT_AI_SETTINGS });
    assert.deepEqual(crumbs.map(({ label }) => label), [settingsCopy[locale].about, settingsCopy[locale].supportAuthor]);
    assert.deepEqual(crumbs[0].destination, { section: "about", path: [] });
  }
  console.log("Support addresses, decoded QR assets and six-language navigation passed.");
}
void main();
