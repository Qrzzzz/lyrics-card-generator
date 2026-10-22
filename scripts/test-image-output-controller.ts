import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import { runImageOutputController, type ImageOutputFailure } from "../lib/image-output-controller";
import { ExportTransactionMutex } from "../lib/export-transaction";
import type { ExportSnapshot } from "../lib/export-snapshot";

async function main() {
  // The same lifecycle contract drives both adapters; the Web Lite adapter
  // holds a cover lease, while the desktop adapter loads capture on demand.
  for (const platform of ["desktop", "web-lite"] as const) {
    const mutex = new ExportTransactionMutex();
    let mounted: ExportSnapshot | undefined;
    let captures = 0;
    let leases = 0;
    let loads = 0;
    let block: string | null = null;
    const messages: string[] = [];
    const state = structuredClone(defaultState);
    const options: Parameters<typeof runImageOutputController>[0] = {
      action: "export", state, pixelRatio: 1, revision: 7, format: "webp", mutex,
      blockingMessage: () => block,
      validate: () => null,
      mount: async (snapshot) => { mounted = snapshot; leases++; return {} as HTMLElement; },
      unmount: () => { leases--; },
      loadCapture: async () => {
        loads++;
        return {
          copyNodeAsPng: async () => { captures++; },
          exportNodeAsImage: async (_node, _file, format) => { assert.equal(format, "webp"); captures++; }
        };
      },
      notify: (message) => { messages.push(message); },
      messages: { tooLarge: "size", busy: "busy", failed: "failed", success: "done" }
    };
    block = "blocked";
    await runImageOutputController(options);
    assert.equal(loads, 0);
    assert.deepEqual(messages.splice(0), ["blocked"]);
    block = null;
    const pending = runImageOutputController(options);
    state.song.title = "edited during output";
    await runImageOutputController(options);
    await pending;
    assert.notEqual(mounted?.song.title, state.song.title, `${platform} captures the immutable snapshot`);
    assert.equal(captures, 1);
    assert.equal(leases, 0);
    assert.deepEqual(messages.splice(0), ["busy", "done"]);
    await runImageOutputController({ ...options, action: "copy" });
    assert.equal(mounted?.format, "png");
    assert.equal(captures, 2);
    messages.length = 0;
    await runImageOutputController({ ...options, validate: () => "late-block" });
    assert.deepEqual(messages.splice(0), ["late-block"]);
    assert.equal(leases, 0);
    await runImageOutputController({ ...options, mount: async () => { leases++; throw new Error("mount failure"); } });
    assert.equal(leases, 0);
    assert.deepEqual(messages.splice(0), ["failed"]);
    let aborted: AbortSignal | undefined;
    await runImageOutputController({ ...options, timeoutMs: 5,
      mount: async (_snapshot, signal) => { leases++; aborted = signal; return new Promise(() => {}); }
    });
    assert.equal(aborted?.aborted, true);
    assert.equal(leases, 0);
    assert.deepEqual(messages.splice(0), ["failed"]);
    const release = mutex.tryAcquire();
    assert.ok(release, "timeout always releases the mutex");
    release();
    messages.length = 0;
    await runImageOutputController({ ...options, unmount: () => { leases--; throw new Error("cleanup failure"); } });
    assert.deepEqual(messages, ["failed"]);
    const cleanupRelease = mutex.tryAcquire();
    assert.ok(cleanupRelease, "even a failing cleanup releases the mutex");
    cleanupRelease();
    const failures: ImageOutputFailure[] = [];
    const untouched = structuredClone(state);
    messages.length = 0;
    const retryable = { ...options, onFailure: (failure: ImageOutputFailure) => failures.push(failure) };
    await runImageOutputController({ ...retryable, loadCapture: async () => { throw new Error("controlled disk/capture failure"); } });
    assert.deepEqual(failures.splice(0), [{ action: "export", reason: "failed", message: "failed" }]);
    assert.deepEqual(messages, [], "persistent feedback replaces the transient error toast");
    assert.deepEqual(state, untouched, "failure never alters the authored document");
    const beforeRetry = captures;
    await runImageOutputController(retryable);
    assert.equal(captures, beforeRetry + 1, "a retry uses a fresh transaction after failure cleanup");
    assert.equal(leases, 0);
    await runImageOutputController({ ...retryable, action: "copy", loadCapture: async () => ({
      exportNodeAsImage: async () => undefined,
      copyNodeAsPng: async () => { throw new Error("controlled clipboard failure"); }
    }) });
    assert.deepEqual(failures.splice(0), [{ action: "copy", reason: "failed", message: "failed" }]);
    await runImageOutputController({ ...retryable, timeoutMs: 5, messages: { ...options.messages, timeout: "timeout" },
      mount: async () => { leases++; return new Promise(() => {}); }
    });
    assert.deepEqual(failures, [{ action: "export", reason: "timeout", message: "timeout" }]);
    assert.equal(leases, 0);
  }
  console.log("Shared image output controller contracts passed for both adapters.");
}

void main();
