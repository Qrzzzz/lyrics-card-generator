import assert from "node:assert/strict";
import type { AppPreferencesSaveOptions, LyricsCardDesktopApi } from "../lib/desktop-api";
import {
  APP_PREFERENCES_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  loadAppPreferences,
  saveAppPreferences
} from "../lib/settings/app-preferences";
import {
  APP_PREFERENCES_SCHEMA_VERSION,
  type AppPreferencesRecord
} from "../lib/settings/app-preferences-reconciliation";
import { DEFAULT_USER_SETTINGS } from "../lib/settings/types";
import { USER_SETTINGS_STORAGE_KEY } from "../lib/settings/user-settings";

class MemoryStorage {
  private values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("renderer cache unavailable");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function record(revision: number, updatedAt: number, locale: AppPreferencesRecord["locale"]): AppPreferencesRecord {
  return {
    schemaVersion: APP_PREFERENCES_SCHEMA_VERSION,
    revision,
    updatedAt,
    locale,
    userSettings: structuredClone(DEFAULT_USER_SETTINGS)
  };
}

// Install renderer and desktop persistence doubles together so reconciliation
// tests observe the same two-copy contract as the packaged application.
function installWindow(
  localStorage: MemoryStorage,
  desktopRecord: AppPreferencesRecord | null,
  saves: AppPreferencesRecord[],
  saveFailure?: Error,
  saveOptions: Array<AppPreferencesSaveOptions | undefined> = []
) {
  const desktop = {
    loadAppPreferences: async () => desktopRecord,
    saveAppPreferences: async (preferences: AppPreferencesRecord, options?: AppPreferencesSaveOptions) => {
      if (saveFailure) throw saveFailure;
      saves.push(structuredClone(preferences));
      saveOptions.push(structuredClone(options));
      return true;
    }
  } as Pick<LyricsCardDesktopApi, "loadAppPreferences" | "saveAppPreferences">;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, lyricsCardDesktop: desktop as LyricsCardDesktopApi }
  });
}

async function jsonAndLocalReconciliation() {
  {
    const storage = new MemoryStorage();
    const saves: AppPreferencesRecord[] = [];
    storage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(record(2, 20, "en")));
    const desktopRecord = record(3, 10, "ja");
    desktopRecord.userSettings.defaultExportFormat = "webp";
    installWindow(storage, desktopRecord, saves);
    const loaded = await loadAppPreferences();
    assert.equal(loaded.locale, "ja", "newer desktop JSON wins");
    assert.equal(loaded.userSettings.defaultExportFormat, "webp", "the saved default export format survives desktop reconciliation");
    assert.equal(JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY)!).locale, "ja");
    assert.equal(saves.length, 0);
  }

  {
    const storage = new MemoryStorage();
    const saves: AppPreferencesRecord[] = [];
    storage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(record(4, 40, "fr")));
    installWindow(storage, record(3, 99, "en"), saves);
    const loaded = await loadAppPreferences();
    assert.equal(loaded.locale, "fr", "newer renderer cache repairs stale desktop JSON");
    assert.equal(saves.at(-1)?.revision, 4);
  }

  {
    const storage = new MemoryStorage();
    const saves: AppPreferencesRecord[] = [];
    storage.setItem(APP_PREFERENCES_STORAGE_KEY, "{broken");
    installWindow(storage, record(5, 50, "es"), saves);
    const loaded = await loadAppPreferences();
    assert.equal(loaded.locale, "es", "corrupt local cache is replaced by valid JSON");
  }
}

async function migrationAndFailures() {
  {
    const storage = new MemoryStorage();
    const saves: AppPreferencesRecord[] = [];
    storage.setItem(LOCALE_STORAGE_KEY, "zh-TW");
    storage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_USER_SETTINGS));
    installWindow(storage, null, saves);
    const loaded = await loadAppPreferences();
    assert.equal(loaded.locale, "zh-TW");
    assert.equal(loaded.revision, 1, "5.1.0 local data receives a one-time revision");
    assert.equal(saves.at(-1)?.revision, 1, "missing JSON is repaired from migrated local data");
  }

  {
    const storage = new MemoryStorage();
    const saves: AppPreferencesRecord[] = [];
    storage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(record(7, 70, "en")));
    installWindow(storage, null, saves, new Error("disk full"));
    const loaded = await loadAppPreferences();
    assert.equal(loaded.locale, "en", "load remains usable when desktop repair write fails");
    await assert.rejects(saveAppPreferences("ja", DEFAULT_USER_SETTINGS), /disk full/);
    assert.equal(
      JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY)!).locale,
      "en",
      "renderer caches remain at the last durable value when desktop persistence fails"
    );
  }

  {
    const storage = new MemoryStorage();
    const saves: AppPreferencesRecord[] = [];
    storage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(record(8, 80, "en")));
    storage.failWrites = true;
    installWindow(storage, null, saves);
    await saveAppPreferences("ja", DEFAULT_USER_SETTINGS);
    assert.equal(saves.at(-1)?.locale, "ja", "desktop persistence remains authoritative");
    assert.equal(
      JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY)!).locale,
      "en",
      "a failed renderer cache does not turn a durable desktop transaction into an error"
    );
  }
}

async function rapidSavesAreMonotonic() {
  const storage = new MemoryStorage();
  const saves: AppPreferencesRecord[] = [];
  installWindow(storage, null, saves);
  const jpgSettings = { ...DEFAULT_USER_SETTINGS, defaultExportFormat: "jpg" as const };
  await Promise.all([
    saveAppPreferences("en", DEFAULT_USER_SETTINGS),
    saveAppPreferences("fr", DEFAULT_USER_SETTINGS),
    saveAppPreferences("ja", jpgSettings)
  ]);
  assert.deepEqual(saves.map(({ revision }) => revision), [1, 2, 3]);
  assert.equal(JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY)!).locale, "ja");
  assert.equal(JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY)!).userSettings.defaultExportFormat, "jpg");
}

async function destructiveHistoryConfirmationIsForwarded() {
  const storage = new MemoryStorage();
  const saves: AppPreferencesRecord[] = [];
  const options: Array<AppPreferencesSaveOptions | undefined> = [];
  installWindow(storage, null, saves, undefined, options);
  const confirmation = {
    importHistoryTrimConfirmation: {
      expectedVersion: "history-version",
      confirmedTrimCount: 7
    }
  };
  await saveAppPreferences("en", { ...DEFAULT_USER_SETTINGS, importHistoryLimit: 5 }, confirmation);
  assert.deepEqual(options.at(-1), confirmation);
  assert.equal(JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY)!).userSettings.importHistoryLimit, 5);
}

void (async () => {
  await jsonAndLocalReconciliation();
  await migrationAndFailures();
  await rapidSavesAreMonotonic();
  await destructiveHistoryConfirmationIsForwarded();
  console.log("app preference persistence behavior tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
