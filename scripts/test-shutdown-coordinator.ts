import assert from "node:assert/strict";
import {
  ShutdownCoordinator,
  ShutdownPersistenceError
} from "../lib/persistence/shutdown-coordinator";

async function flushesEveryRegisteredSource() {
  const coordinator = new ShutdownCoordinator();
  const calls: string[] = [];
  coordinator.register("preferences", async () => { calls.push("preferences"); });
  const unregister = coordinator.register("ai", async () => { calls.push("ai"); });
  await coordinator.flushAll();
  assert.deepEqual(calls.sort(), ["ai", "preferences"]);
  unregister();
  calls.length = 0;
  await coordinator.flushAll();
  assert.deepEqual(calls, ["preferences"]);
}

async function reportsFailureWithoutInfiniteWait() {
  const coordinator = new ShutdownCoordinator();
  coordinator.register("failed", async () => { throw new Error("disk full"); });
  await assert.rejects(coordinator.flushAll(100), (error: unknown) =>
    error instanceof ShutdownPersistenceError && error.failures[0]?.id === "failed"
  );

  // A non-settling persistence source must be reported without trapping the
  // application in shutdown forever.
  const hanging = new ShutdownCoordinator();
  hanging.register("hanging", async () => new Promise(() => undefined));
  const startedAt = Date.now();
  await assert.rejects(hanging.flushAll(20), /timed out/);
  assert.ok(Date.now() - startedAt < 200);
}

void (async () => {
  await flushesEveryRegisteredSource();
  await reportsFailureWithoutInfiniteWait();
  console.log("shutdown coordinator tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
