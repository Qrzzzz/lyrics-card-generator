import {
  createLatestSaveController,
  type SaveControllerState,
  type SaveSnapshot
} from "@/lib/ai/ai-settings-save-controller";
import type { AppPreferencesPersistenceOptions } from "@/lib/settings/app-preferences";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

export type AppPreferenceSaveValue = {
  locale: Locale;
  userSettings: UserSettings;
  options?: AppPreferencesPersistenceOptions;
};

type AppPreferenceSaveCoordinatorOptions = {
  initialValue: AppPreferenceSaveValue;
  persist: (value: AppPreferenceSaveValue) => Promise<unknown>;
};

export type AppPreferenceSaveCoordinator = {
  queueUserSettings: (
    locale: Locale,
    userSettings: UserSettings,
    options?: AppPreferencesPersistenceOptions
  ) => void;
  queueLocale: (locale: Locale) => void;
  flush: () => Promise<void>;
  resetPersisted: (value: AppPreferenceSaveValue) => void;
  rollbackDesiredToPersisted: () => AppPreferenceSaveValue;
  getDesired: () => AppPreferenceSaveValue;
  getPersisted: () => AppPreferenceSaveValue;
  getState: () => SaveControllerState;
};

/**
 * Owns the two preference snapshots that have different concurrency meanings:
 * the latest user intent used to compose new writes, and the last value that
 * actually reached persistence and can therefore be used for error rollback.
 */
export function createAppPreferenceSaveCoordinator({
  initialValue,
  persist
}: AppPreferenceSaveCoordinatorOptions): AppPreferenceSaveCoordinator {
  let desiredValue = initialValue;
  let persistedValue = initialValue;
  let persistenceError: unknown = null;

  const controller = createLatestSaveController<AppPreferenceSaveValue, unknown>({
    persist: ({ value }) => persist(value),
    onPersisted: (_result, snapshot, isLatest) => {
      // Even an obsolete completion is the latest value known to be durable.
      // It must not replace desiredValue, which represents newer user intent.
      persistedValue = snapshot.value;
      if (isLatest) persistenceError = null;
    },
    onError: (error) => {
      persistenceError = error;
    }
  });
  controller.resetPersisted(createAppPreferenceSaveSnapshot(initialValue));

  function queue(value: AppPreferenceSaveValue) {
    desiredValue = value;
    controller.setDesired(createAppPreferenceSaveSnapshot(value));
    void controller.flushLatest();
  }

  async function flush() {
    controller.setDesired(createAppPreferenceSaveSnapshot(desiredValue));
    await controller.flushLatest();
    await controller.whenIdle();
    if (controller.getState().status === "error") {
      throw persistenceError ?? new Error("Unable to save application preferences.");
    }
  }

  function resetPersisted(value: AppPreferenceSaveValue) {
    desiredValue = value;
    persistedValue = value;
    persistenceError = null;
    controller.resetPersisted(createAppPreferenceSaveSnapshot(value));
  }

  return {
    queueUserSettings: (locale, userSettings, options) => {
      queue({ locale, userSettings, options });
    },
    queueLocale: (locale) => {
      // Compose with the newest committed UI intent, not merely the last write
      // that happened to finish. Preview-only settings never enter this value.
      queue({ locale, userSettings: desiredValue.userSettings });
    },
    flush,
    resetPersisted,
    rollbackDesiredToPersisted: () => {
      const fallback = persistedValue;
      resetPersisted(fallback);
      return fallback;
    },
    getDesired: () => desiredValue,
    getPersisted: () => persistedValue,
    getState: () => controller.getState()
  };
}

function createAppPreferenceSaveSnapshot(
  value: AppPreferenceSaveValue
): SaveSnapshot<AppPreferenceSaveValue> {
  return {
    signature: JSON.stringify(value),
    value
  };
}
