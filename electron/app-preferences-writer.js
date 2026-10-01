const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeStoredPreferences } = require("./user-preferences");

/** Serializes atomic writes without letting a failed write poison the queue. */
function createAppPreferencesWriter({ getTargetPath, onPersisted = (_preferences) => {}, fileSystem = fs }) {
  let queue = Promise.resolve();
  async function publish(preferences) {
    const target = getTargetPath();
    try {
      const current = normalizeStoredPreferences(JSON.parse(await fileSystem.readFile(target, "utf8")));
      if (current && (current.revision > preferences.revision ||
        (current.revision === preferences.revision && current.updatedAt > preferences.updatedAt))) return current;
    } catch {
      // Missing, corrupt, or legacy preference files are replaced below.
    }
    await fileSystem.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await fileSystem.writeFile(temporary, JSON.stringify(preferences, null, 2), { encoding: "utf8", mode: 0o600 });
    await fileSystem.rename(temporary, target);
    await fileSystem.chmod(target, 0o600).catch(() => undefined);
    return preferences;
  }
  return {
    write(preferences) {
      const operation = queue.catch(() => undefined).then(() => publish(preferences)).then((persisted) => {
        onPersisted(persisted);
        return persisted;
      });
      queue = operation;
      return operation;
    },
    drain() { return queue; }
  };
}

module.exports = { createAppPreferencesWriter };
