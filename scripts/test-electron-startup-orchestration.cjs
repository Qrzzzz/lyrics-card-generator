const assert = require("node:assert/strict");
const { prepareDesktopStartup } = require("../electron/startup-orchestration");

async function testPackagedWorkRunsInParallel() {
  const history = deferred();
  const appUrl = deferred();
  const serverLaunch = deferred();
  const events = [];
  let loaded = false;
  const operation = prepareDesktopStartup({
    initializeHistory: () => {
      events.push("history-start");
      return history.promise;
    },
    resolveAppUrl: () => {
      events.push("server-start");
      return appUrl.promise;
    },
    waitForDevelopmentServer: async () => assert.fail("packaged startup never uses the development probe"),
    waitForBackgroundStart: () => {
      events.push("server-launch-wait");
      return serverLaunch.promise;
    },
    createHiddenWindow: () => {
      events.push("window-created-hidden");
      return { hidden: true, navigate: () => { loaded = true; } };
    }
  });

  assert.deepEqual(events, ["history-start", "server-start", "server-launch-wait"]);
  serverLaunch.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["history-start", "server-start", "server-launch-wait", "window-created-hidden"]);
  assert.equal(loaded, false, "the hidden window is not navigated by prerequisite coordination");
  appUrl.resolve({ url: "http://127.0.0.1:43100", waitForReady: false });
  await Promise.resolve();
  let settled = false;
  void operation.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "history readiness remains a prerequisite after server readiness");
  history.resolve();
  const result = await operation;
  assert.deepEqual(result.resolvedAppUrl, { url: "http://127.0.0.1:43100", waitForReady: false });
  assert.equal(result.window.hidden, true);
  assert.equal(loaded, false);
}

async function testDevelopmentReadinessPrecedesCompletion() {
  const developmentReady = deferred();
  const events = [];
  const operation = prepareDesktopStartup({
    initializeHistory: async () => events.push("history-ready"),
    resolveAppUrl: async () => ({ url: "http://127.0.0.1:3000", waitForReady: true }),
    waitForDevelopmentServer: async (url) => {
      events.push(`development-wait:${url}`);
      await developmentReady.promise;
      events.push("development-ready");
    },
    waitForBackgroundStart: async () => events.push("development-launch-ready"),
    createHiddenWindow: () => ({ hidden: true })
  });
  await Promise.resolve();
  assert.ok(events.includes("development-wait:http://127.0.0.1:3000"));
  developmentReady.resolve();
  await operation;
  assert.ok(events.indexOf("development-ready") > events.indexOf("development-wait:http://127.0.0.1:3000"));
}

async function testFailureNeverReturnsATrustedWindow() {
  let windowCreated = false;
  await assert.rejects(
    () => prepareDesktopStartup({
      initializeHistory: async () => undefined,
      resolveAppUrl: async () => { throw new Error("readiness rejected"); },
      waitForDevelopmentServer: async () => undefined,
      waitForBackgroundStart: () => new Promise(() => undefined),
      createHiddenWindow: () => {
        windowCreated = true;
        return { hidden: true };
      }
    }),
    /readiness rejected/
  );
  assert.equal(windowCreated, false, "an early readiness failure aborts before native window construction");
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function run() {
  await testPackagedWorkRunsInParallel();
  await testDevelopmentReadinessPrecedesCompletion();
  await testFailureNeverReturnsATrustedWindow();
  console.log("Electron startup orchestration tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
