const fs = require("node:fs/promises");
const { normalizeStoredPreferences } = require("./user-preferences");
const { createAppPreferencesWriter } = require("./app-preferences-writer");

/** Owns read fallback and serialized atomic writes; the caller owns trim transactions. */
function createAppPreferencesService({ getTargetPath, filesystem = fs, onDiagnostic = console.error }) {
  let lastKnown = null;
  /** @type {Promise<ReturnType<typeof normalizeStoredPreferences>>} */
  let queue = Promise.resolve(null);
  const writer = createAppPreferencesWriter({
    getTargetPath, fileSystem: filesystem, onPersisted: (persisted) => { lastKnown = persisted; }
  });
  function write(preferences) { queue = writer.write(preferences); return queue; }
  async function read() {
    // A brief atomic publication window must never reset the retained history limit.
    await queue.catch(() => undefined);
    try {
      const parsed = JSON.parse(await filesystem.readFile(getTargetPath(), "utf8"));
      const preferences = normalizeStoredPreferences(parsed);
      if (preferences) lastKnown = preferences;
      return preferences ?? lastKnown;
    } catch (error) {
      if (error?.code !== "ENOENT") onDiagnostic("[app-preferences] unable to read preferences",
        error instanceof Error ? error.message : "unknown error");
      return lastKnown;
    }
  }
  return { read, write, flush: () => queue };
}
module.exports = { createAppPreferencesService };
