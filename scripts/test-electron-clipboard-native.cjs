const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { app, nativeImage } = require("electron");
const { PNG_DATA_URL_PREFIX, createClipboardImageWriter } = require("../electron/clipboard-image");

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const png = readFileSync(path.join(__dirname, "..", "public", "app-icon.png"));
  let writtenImage;
  const writer = createClipboardImageWriter(nativeImage, {
    writeImage(image) { writtenImage = image; }
  });
  const result = writer({}, `${PNG_DATA_URL_PREFIX}${png.toString("base64")}`);
  assert.equal(result, true, "a real ordinary PNG decodes through Electron nativeImage");
  assert.ok(writtenImage && !writtenImage.isEmpty());
  assert.deepEqual(writtenImage.getSize(), { width: 1024, height: 1024 });
  console.log("Electron nativeImage clipboard PNG smoke test passed");
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
