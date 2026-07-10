import assert from "node:assert/strict";
import {
  createLatestSaveController,
  type SaveSnapshot,
  type SaveState
} from "../lib/ai/ai-settings-save-controller";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

type SaveRequest = {
  snapshot: SaveSnapshot<string>;
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

function snapshot(signature: string): SaveSnapshot<string> {
  return { signature, value: signature };
}

function createHarness(initialSignature = "B") {
  const requests: SaveRequest[] = [];
  const states: SaveState[] = [];
  const persistedCallbacks: Array<{ signature: string; isLatest: boolean }> = [];
  let backendSignature = initialSignature;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  const controller = createLatestSaveController<string, string>({
    persist: async (nextSnapshot) => {
      const deferred = createDeferred();
      requests.push({ snapshot: nextSnapshot, deferred });
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      try {
        await deferred.promise;
        backendSignature = nextSnapshot.signature;
        return nextSnapshot.signature;
      } finally {
        activeRequests -= 1;
      }
    },
    onStateChange: (state) => states.push(state),
    onPersisted: (_result, savedSnapshot, isLatest) => {
      persistedCallbacks.push({ signature: savedSnapshot.signature, isLatest });
    }
  });
  controller.resetPersisted(snapshot(initialSignature));

  return {
    controller,
    requests,
    states,
    persistedCallbacks,
    getBackendSignature: () => backendSignature,
    getMaxActiveRequests: () => maxActiveRequests
  };
}

async function waitForRequestCount(requests: SaveRequest[], expected: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (requests.length >= expected) return;
    await Promise.resolve();
  }
  assert.fail(`Expected ${expected} save requests, received ${requests.length}`);
}

async function testRestoringPersistedValueDuringInflightSave() {
  const harness = createHarness("B");
  harness.controller.setDesired(snapshot("A"));
  assert.equal(harness.controller.getState().status, "pending");

  const drain = harness.controller.flushLatest();
  await waitForRequestCount(harness.requests, 1);
  assert.equal(harness.requests[0].snapshot.signature, "A");

  harness.controller.setDesired(snapshot("B"));
  const stateCountAfterRestore = harness.states.length;
  assert.equal(harness.controller.getState().status, "saving");

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  assert.equal(harness.getBackendSignature(), "A");
  assert.equal(harness.requests[1].snapshot.signature, "B");
  assert.equal(harness.controller.getState().status, "saving");
  assert.equal(harness.states.slice(stateCountAfterRestore).includes("saved"), false);
  assert.deepEqual(harness.persistedCallbacks, [{ signature: "A", isLatest: false }]);

  harness.requests[1].deferred.resolve();
  await drain;
  assert.equal(harness.getBackendSignature(), "B");
  assert.equal(harness.controller.getState().status, "saved");
  assert.equal(harness.getMaxActiveRequests(), 1);
  assert.deepEqual(harness.persistedCallbacks, [
    { signature: "A", isLatest: false },
    { signature: "B", isLatest: true }
  ]);
}

async function testCloseFlushKeepsReconciliationAlive() {
  const harness = createHarness("B");
  harness.controller.setDesired(snapshot("A"));
  const initialDrain = harness.controller.flushLatest();
  await waitForRequestCount(harness.requests, 1);

  harness.controller.setDesired(snapshot("B"));
  const closeDrain = harness.controller.flushLatest();
  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  assert.equal(harness.requests[1].snapshot.signature, "B");
  assert.equal(harness.controller.getState().status, "saving");

  harness.requests[1].deferred.resolve();
  await Promise.all([initialDrain, closeDrain]);
  assert.equal(harness.getBackendSignature(), "B");
  assert.equal(harness.controller.getState().status, "saved");
  assert.equal(harness.getMaxActiveRequests(), 1);
}

async function testStaleFailureStillReplaysLatestValue() {
  const harness = createHarness("B");
  harness.controller.setDesired(snapshot("A"));
  const drain = harness.controller.flushLatest();
  await waitForRequestCount(harness.requests, 1);
  harness.controller.setDesired(snapshot("B"));

  harness.requests[0].deferred.reject(new Error("response lost"));
  await waitForRequestCount(harness.requests, 2);
  assert.equal(harness.requests[1].snapshot.signature, "B");
  assert.equal(harness.controller.getState().status, "saving");

  harness.requests[1].deferred.resolve();
  await drain;
  assert.equal(harness.getBackendSignature(), "B");
  assert.equal(harness.controller.getState().status, "saved");
}

async function testLatestSlotSkipsObsoleteIntermediateValues() {
  const harness = createHarness("B");
  harness.controller.setDesired(snapshot("A"));
  const drain = harness.controller.flushLatest();
  await waitForRequestCount(harness.requests, 1);
  harness.controller.setDesired(snapshot("C"));
  harness.controller.setDesired(snapshot("D"));

  harness.requests[0].deferred.resolve();
  await waitForRequestCount(harness.requests, 2);
  assert.deepEqual(harness.requests.map((request) => request.snapshot.signature), ["A", "D"]);
  harness.requests[1].deferred.resolve();
  await drain;
  assert.equal(harness.getBackendSignature(), "D");
  assert.equal(harness.controller.getState().status, "saved");
}

async function testLatestFailureStopsUntilExplicitRetry() {
  const harness = createHarness("B");
  harness.controller.setDesired(snapshot("A"));
  const failedDrain = harness.controller.flushLatest();
  await waitForRequestCount(harness.requests, 1);
  harness.requests[0].deferred.reject(new Error("save failed"));
  await failedDrain;
  assert.equal(harness.controller.getState().status, "error");
  assert.equal(harness.requests.length, 1);

  const retryDrain = harness.controller.flushLatest();
  await waitForRequestCount(harness.requests, 2);
  harness.requests[1].deferred.resolve();
  await retryDrain;
  assert.equal(harness.getBackendSignature(), "A");
  assert.equal(harness.controller.getState().status, "saved");
}

async function main() {
  await testRestoringPersistedValueDuringInflightSave();
  await testCloseFlushKeepsReconciliationAlive();
  await testStaleFailureStillReplaysLatestValue();
  await testLatestSlotSkipsObsoleteIntermediateValues();
  await testLatestFailureStopsUntilExplicitRetry();

  console.log(JSON.stringify({ ok: true, aiSettingsSaveControllerTests: 5 }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
