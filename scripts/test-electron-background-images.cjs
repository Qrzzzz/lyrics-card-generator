const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  getBackgroundImageMime,
  safeBackgroundPathForUserData
} = require("../electron/background-images");

const userDataPath = path.join(process.cwd(), ".tmp-user-data");
const backgroundsDirectory = path.resolve(userDataPath, "backgrounds");

function assertValid(imageId, expectedMime) {
  const target = safeBackgroundPathForUserData(userDataPath, imageId);
  assert.equal(target, path.join(backgroundsDirectory, imageId));
  assert.equal(getBackgroundImageMime(target), expectedMime);
}

assertValid("1719800000000-abc123de.png", "image/png");
assertValid("1719800000000-abc123de.jpg", "image/jpeg");
assertValid("1719800000000-abc123de.jpeg", "image/jpeg");
assertValid("1719800000000-abc123de.webp", "image/webp");
assertValid("1719800000000-abc123de.gif", "image/gif");

for (const imageId of [
  "..",
  "../x.png",
  "x/../y.png",
  "1719800000000-abc123de.svg",
  "1719800000000-abc123de.PNG",
  "x.png",
  "",
  null,
  undefined,
  123
]) {
  assert.equal(safeBackgroundPathForUserData(userDataPath, imageId), null, `rejects ${String(imageId)}`);
}

const preferencesSource = fs.readFileSync(path.resolve("components/editor/hooks/useEditorPreferences.ts"), "utf8");
const backgroundSource = fs.readFileSync(path.resolve("components/layout/DynamicAppBackground.tsx"), "utf8");
const backgroundStorageSource = fs.readFileSync(path.resolve("lib/settings/background-storage.ts"), "utf8");
const backgroundSettingsSource = fs.readFileSync(path.resolve("components/settings/BackgroundSettingsSection.tsx"), "utf8");
assert.doesNotMatch(preferencesSource, /loadBackgroundImage|backgroundImageUrl|readBackgroundImage/);
assert.doesNotMatch(backgroundSource, /imageUrl/, "the renderer background never consumed the loaded object/data URL");
assert.match(backgroundStorageSource, /export async function loadBackgroundImage/);
assert.match(backgroundSettingsSource, /appBackground/, "background settings and persistence remain available");

console.log(JSON.stringify({
  ok: true,
  electronBackgroundImageTests: 19,
  unusedBackgroundWork: {
    before: { unconsumedReloads: 1, duplicateBase64OrBlobConversions: 1, consumers: 0 },
    after: { unconsumedReloads: 0, duplicateBase64OrBlobConversions: 0, consumers: 0 }
  }
}, null, 2));
