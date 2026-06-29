const assert = require("node:assert/strict");
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

console.log(JSON.stringify({ ok: true, electronBackgroundImageTests: 15 }, null, 2));
