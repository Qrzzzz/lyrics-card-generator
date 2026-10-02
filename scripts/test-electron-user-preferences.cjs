const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { normalizeStoredPreferences } = require("../electron/user-preferences");

const valid = normalizeStoredPreferences({
  locale: "zh-TW",
  userSettings: {
    firstLaunchLanguageSelected: true,
    reduceMotionEnabled: true,
    defaultShowGeneratedWatermark: true,
    defaultShowSharedBy: true,
    defaultSharedByText: "Shared by Test",
    defaultExportFormat: "webp"
  }
});
assert.equal(valid.locale, "zh-TW");
assert.equal(valid.schemaVersion, 2);
assert.equal(valid.revision, 0);
assert.equal(valid.updatedAt, 0);
assert.equal(valid.userSettings.firstLaunchLanguageSelected, true);
assert.equal(valid.userSettings.reduceMotionEnabled, true);
assert.equal(valid.userSettings.defaultShowGeneratedWatermark, true);
assert.equal(valid.userSettings.defaultShowSharedBy, true);
assert.equal(valid.userSettings.defaultSharedByText, "Shared by Test");
assert.equal(valid.userSettings.defaultExportFormat, "webp");
assert.equal(normalizeStoredPreferences({ locale: "de", userSettings: {} }), null);
assert.equal(normalizeStoredPreferences({ locale: "en", userSettings: null }), null);

const mainSource = readFileSync(resolve("electron/main.js"), "utf8");
const serviceSource = readFileSync(resolve("electron/app-preferences-service.js"), "utf8");
assert.match(mainSource, /require\("\.\/app-preferences-service"\)/);
assert.match(mainSource, /await enqueueAppPreferencesWrite\(preferences\)/);
assert.match(mainSource, /appPreferencesService\.write\(preferences\)/);
assert.match(serviceSource, /require\("\.\/app-preferences-writer"\)/);
assert.match(serviceSource, /queue = writer\.write\(preferences\)/);
assert.match(serviceSource, /await queue\.catch/);

async function testWriter() {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const os = require("node:os");
  const { createAppPreferencesWriter } = require("../electron/app-preferences-writer");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lyrics-preferences-writer-"));
  const target = path.join(directory, "app-preferences.json");
  const published = [];
  let failWrite = false;
  let failChmod = false;
  const writer = createAppPreferencesWriter({
    getTargetPath: () => target, onPersisted: (value) => published.push(value),
    fileSystem: {
      ...fs,
      writeFile: (...args) => failWrite ? Promise.reject(new Error("injected disk failure")) : fs.writeFile(...args),
      chmod: (...args) => failChmod ? Promise.reject(new Error("injected chmod failure")) : fs.chmod(...args)
    }
  });
  const preferences = (revision, updatedAt = revision * 100) => ({ ...valid, revision, updatedAt });
  try {
    await writer.write(preferences(2));
    assert.equal((await writer.write(preferences(1))).revision, 2, "stale writes cannot replace a newer revision");
    assert.equal((await writer.write(preferences(2, 50))).updatedAt, 200, "older timestamp at equal revision is rejected");
    await writer.write(preferences(2, 201));
    await Promise.all([writer.write(preferences(3)), writer.write(preferences(4)), writer.write(preferences(3))]);
    await writer.drain();
    assert.equal(JSON.parse(await fs.readFile(target, "utf8")).revision, 4, "queued writes publish complete documents in order");
    assert.equal(await fs.stat(`${target}.tmp`).then(() => true, () => false), false, "atomic publication consumes the temporary file");
    failWrite = true;
    await assert.rejects(writer.write(preferences(5)), /disk failure/);
    await assert.rejects(writer.drain(), /disk failure/);
    assert.equal(JSON.parse(await fs.readFile(target, "utf8")).revision, 4, "save failure preserves the previous complete document");
    failWrite = false;
    failChmod = true;
    await writer.write(preferences(6));
    assert.equal(published.at(-1).revision, 6, "a failed write cannot poison subsequent saves");
    await fs.writeFile(target, "corrupt");
    await writer.write(preferences(7));
    await fs.writeFile(target, JSON.stringify({ locale: "invalid" }));
    await writer.write(preferences(8));
    await createAppPreferencesWriter({ getTargetPath: () => target }).write(preferences(9));
    assert.equal(JSON.parse(await fs.readFile(target, "utf8")).revision, 9);
    console.log(JSON.stringify({ ok: true, preferenceTests: 14, writer: "atomic files, stale revision/timestamp, concurrent writes, disk failure, retry, corrupt/legacy recovery" }));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

testWriter().catch((error) => { console.error(error); process.exitCode = 1; });
