import assert from "node:assert/strict";
import {
  createAppPreferenceSaveCoordinator,
  type AppPreferenceSaveValue
} from "../lib/settings/app-preference-save-coordinator";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../lib/settings/types";
import { runFireAndForgetSave } from "../lib/settings/fire-and-forget-save";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

type SaveRequest = {
  value: AppPreferenceSaveValue;
  deferred: Deferred;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function settings(overrides: Partial<UserSettings>): UserSettings {
  return {
    ...structuredClone(DEFAULT_USER_SETTINGS),
    ...overrides
  };
}

function createHarness() {
  const initialValue: AppPreferenceSaveValue = {
    locale: "zh",
    userSettings: settings({ defaultSharedByText: "initial" })
  };
  const requests: SaveRequest[] = [];
  let backendValue = initialValue;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  const coordinator = createAppPreferenceSaveCoordinator({
    initialValue,
    persist: async (value) => {
      const deferred = createDeferred();
      requests.push({ value, deferred });
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      try {
        await deferred.promise;
        backendValue = value;
      } finally {
        activeRequests -= 1;
      }
    }
  });

  return {
    coordinator,
    initialValue,
    requests,
    getBackendValue: () => backendValue,
    getMaxActiveRequests: () => maxActiveRequests
  };
}

async function waitForRequestCount(requests: SaveRequest[], expected: number) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (requests.length >= expected) return;
    await Promise.resolve();
  }
  assert.fail(`Expected ${expected} save requests, received ${requests.length}`);
}

async function testSettingsThenLocaleUsesLatestSettings() {
  const harness = createHarness();
  const nextSettings = settings({
    defaultSharedByText: "new settings",
    reduceMotionEnabled: true,
    defaultExportFormat: "webp"
  });

  harness.coordinator.queueUserSettings("zh", nextSettings);
  const flush = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 1);
  harness.coordinator.queueLocale("en");

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  assert.equal(harness.requests[1].value.locale, "en");
  assert.deepEqual(harness.requests[1].value.userSettings, nextSettings);
  harness.requests[1].deferred.resolve();
  await flush;

  assert.deepEqual(harness.getBackendValue(), {
    locale: "en",
    userSettings: nextSettings
  });
  assert.equal(harness.getMaxActiveRequests(), 1);
}

async function testLocaleThenSettingsPreservesBothValues() {
  const harness = createHarness();
  const nextSettings = settings({
    uiThemeMode: "light",
    defaultExportQuality: "medium",
    defaultExportPixelRatio: 1.4
  });

  harness.coordinator.queueLocale("ja");
  const flush = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 1);
  harness.coordinator.queueUserSettings("ja", nextSettings);

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  assert.deepEqual(harness.requests[1].value, {
    locale: "ja",
    userSettings: nextSettings,
    options: undefined
  });
  harness.requests[1].deferred.resolve();
  await flush;

  assert.equal(harness.getBackendValue().locale, "ja");
  assert.deepEqual(harness.getBackendValue().userSettings, nextSettings);
}

async function testConcurrentSettingsSavesCoalesceToLatestIntent() {
  const harness = createHarness();
  const first = settings({ defaultSharedByText: "first" });
  const skipped = settings({ defaultSharedByText: "skipped", sparkCursorEnabled: false });
  const latest = settings({
    defaultSharedByText: "latest",
    sparkCursorEnabled: false,
    importHistoryLimit: "unlimited"
  });

  harness.coordinator.queueUserSettings("zh", first);
  const flush = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 1);
  harness.coordinator.queueUserSettings("zh", skipped);
  harness.coordinator.queueUserSettings("zh", latest);
  harness.coordinator.queueLocale("en");

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  assert.deepEqual(
    harness.requests.map((request) => request.value.userSettings.defaultSharedByText),
    ["first", "latest"]
  );
  assert.equal(harness.requests[1].value.locale, "en");
  assert.deepEqual(harness.coordinator.getDesired().userSettings, latest);
  harness.requests[1].deferred.resolve();
  await flush;

  assert.deepEqual(harness.getBackendValue().userSettings, latest);
  assert.equal(harness.getMaxActiveRequests(), 1);
}

async function testFailureSurfacesAndExplicitRetryKeepsLatestIntent() {
  const harness = createHarness();
  const nextSettings = settings({ defaultSharedByText: "retry me" });
  harness.coordinator.queueUserSettings("zh", nextSettings);
  const failedFlush = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 1);
  harness.coordinator.queueLocale("fr");

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  const failure = new Error("durable write failed");
  harness.requests[1].deferred.reject(failure);
  await assert.rejects(failedFlush, failure);
  assert.equal(harness.coordinator.getState().status, "error");
  assert.deepEqual(harness.coordinator.getDesired(), {
    locale: "fr",
    userSettings: nextSettings
  });
  assert.deepEqual(harness.coordinator.getPersisted(), {
    locale: "zh",
    userSettings: nextSettings,
    options: undefined
  });

  const retry = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 3);
  assert.deepEqual(harness.requests[2].value, {
    locale: "fr",
    userSettings: nextSettings
  });
  harness.requests[2].deferred.resolve();
  await retry;
  assert.deepEqual(harness.getBackendValue(), {
    locale: "fr",
    userSettings: nextSettings
  });
}

async function testRollbackAndShutdownFlushUseRealDurableState() {
  const harness = createHarness();
  const first = settings({ defaultSharedByText: "durable" });
  const latest = settings({ defaultSharedByText: "latest" });
  harness.coordinator.queueUserSettings("zh", first);
  const failedFlush = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 1);
  harness.coordinator.queueUserSettings("zh", latest);
  harness.coordinator.queueLocale("es");

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  harness.requests[1].deferred.reject(new Error("latest failed"));
  await assert.rejects(failedFlush, /latest failed/);

  const fallback = harness.coordinator.rollbackDesiredToPersisted();
  assert.equal(fallback.locale, "zh");
  assert.deepEqual(fallback.userSettings, first);
  assert.equal(harness.coordinator.getState().status, "saved");

  // A locale action after the failed newer save composes with the rollback's
  // real durable settings, never the rejected newer snapshot.
  harness.coordinator.queueLocale("es");
  const localeAfterFailure = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 3);
  assert.equal(harness.requests[2].value.locale, "es");
  assert.deepEqual(harness.requests[2].value.userSettings, first);
  harness.requests[2].deferred.resolve();
  await localeAfterFailure;

  // The lifetime hook stays mounted when the settings surface closes. Its
  // relevant cleanup boundary is the shutdown flush, which must drain the
  // newest combined intent even when a write is already running.
  const reopened = settings({ defaultSharedByText: "after rollback" });
  harness.coordinator.queueUserSettings("es", reopened);
  await waitForRequestCount(harness.requests, 4);
  harness.coordinator.queueLocale("ja");
  const shutdownFlush = harness.coordinator.flush();
  harness.requests[3].deferred.resolve();
  await waitForRequestCount(harness.requests, 5);
  assert.equal(harness.requests[4].value.locale, "ja");
  assert.deepEqual(harness.requests[4].value.userSettings, reopened);
  harness.requests[4].deferred.resolve();
  await shutdownFlush;
  assert.deepEqual(harness.getBackendValue(), {
    locale: "ja",
    userSettings: reopened
  });
}

async function testPreviewDraftIsNotImplicitlySavedByLocale() {
  const harness = createHarness();
  const previewOnly = settings({
    defaultSharedByText: "preview only",
    reduceMotionEnabled: true
  });

  // previewUserSettings intentionally updates React presentation only. Since
  // it does not call queueUserSettings, a locale write must use the last
  // committed intent held by the coordinator.
  assert.notDeepEqual(previewOnly, harness.coordinator.getDesired().userSettings);
  harness.coordinator.queueLocale("fr");
  const flush = harness.coordinator.flush();
  await waitForRequestCount(harness.requests, 1);
  assert.deepEqual(
    harness.requests[0].value.userSettings,
    harness.initialValue.userSettings
  );
  harness.requests[0].deferred.resolve();
  await flush;
}

async function testFireAndForgetRejectionIsHandledAndVisible() {
  const deferred = createDeferred();
  const visibleErrors: unknown[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  try {
    runFireAndForgetSave(
      () => deferred.promise,
      {
        onSuccess: () => assert.fail("a rejected save must not report success"),
        onError: (error) => visibleErrors.push(error)
      }
    );
    const failure = new Error("visible save failure");
    deferred.reject(failure);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(visibleErrors, [failure]);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}

async function main() {
  await testSettingsThenLocaleUsesLatestSettings();
  await testLocaleThenSettingsPreservesBothValues();
  await testConcurrentSettingsSavesCoalesceToLatestIntent();
  await testFailureSurfacesAndExplicitRetryKeepsLatestIntent();
  await testRollbackAndShutdownFlushUseRealDurableState();
  await testPreviewDraftIsNotImplicitlySavedByLocale();
  await testFireAndForgetRejectionIsHandledAndVisible();

  console.log(JSON.stringify({ ok: true, appPreferenceSaveCoordinatorTests: 7 }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
