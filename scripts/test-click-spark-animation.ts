import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClickSparkAnimationLoop } from "../components/layout/click-spark-animation-loop";

type AnimationHarness = ReturnType<typeof createAnimationHarness>;

function createAnimationHarness(frameResults: boolean[] = []) {
  let enabled = true;
  let reducedMotion = false;
  let nextFrameId = 1;
  let requestCount = 0;
  let drawCount = 0;
  let resetCount = 0;
  const canceledFrameIds: number[] = [];
  const callbacks = new Map<number, FrameRequestCallback>();

  const runtime = createClickSparkAnimationLoop({
    requestFrame(callback) {
      const frameId = nextFrameId;
      nextFrameId += 1;
      requestCount += 1;
      callbacks.set(frameId, callback);
      return frameId;
    },
    cancelFrame(frameId) {
      canceledFrameIds.push(frameId);
      callbacks.delete(frameId);
    },
    canAnimate() {
      return enabled && !reducedMotion;
    },
    drawFrame() {
      const result = frameResults[drawCount] ?? false;
      drawCount += 1;
      return result;
    },
    resetFrame() {
      resetCount += 1;
    }
  });

  return {
    runtime,
    setEnabled(value: boolean) {
      enabled = value;
    },
    setReducedMotion(value: boolean) {
      reducedMotion = value;
    },
    runNextFrame(timestamp = 0) {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      assert.ok(next, "expected a queued animation frame");
      const [frameId, callback] = next;
      callbacks.delete(frameId);
      callback(timestamp);
    },
    captureNextCallback() {
      const next = callbacks.values().next().value as FrameRequestCallback | undefined;
      assert.ok(next, "expected a queued animation frame callback");
      return next;
    },
    get pendingFrameCount() {
      return callbacks.size;
    },
    get requestCount() {
      return requestCount;
    },
    get drawCount() {
      return drawCount;
    },
    get resetCount() {
      return resetCount;
    },
    get canceledFrameIds() {
      return canceledFrameIds;
    }
  };
}

function assertIdle(harness: AnimationHarness) {
  assert.equal(harness.pendingFrameCount, 0);
  assert.equal(harness.requestCount, 0);
  assert.equal(harness.drawCount, 0);
  assert.equal(harness.resetCount, 0);
}

{
  const harness = createAnimationHarness();
  assertIdle(harness);
}

{
  const harness = createAnimationHarness([true, false, false]);
  harness.runtime.start();
  assert.equal(harness.pendingFrameCount, 1, "a click should start one animation frame");
  assert.equal(harness.requestCount, 1);

  harness.runtime.start();
  assert.equal(harness.requestCount, 1, "repeated clicks must share the active frame loop");

  harness.runNextFrame(16);
  assert.equal(harness.drawCount, 1);
  assert.equal(harness.pendingFrameCount, 1, "active sparks should schedule the next frame");

  harness.runNextFrame(536);
  assert.equal(harness.drawCount, 2);
  assert.equal(harness.pendingFrameCount, 0, "the final frame should stop scheduling");
  assert.equal(harness.runtime.isRunning(), false);

  harness.runtime.start();
  assert.equal(harness.pendingFrameCount, 1, "a later click should restart a completed loop");
  assert.equal(harness.requestCount, 3);
  harness.runNextFrame(552);
  assert.equal(harness.pendingFrameCount, 0);
}

{
  const harness = createAnimationHarness([true]);
  harness.setEnabled(false);
  harness.runtime.start();
  assertIdle(harness);

  harness.setEnabled(true);
  harness.runtime.start();
  const staleCallback = harness.captureNextCallback();
  harness.setEnabled(false);
  harness.runtime.stop(true);
  assert.equal(harness.pendingFrameCount, 0);
  assert.equal(harness.canceledFrameIds.length, 1, "disabling should cancel the queued frame");
  assert.equal(harness.resetCount, 1, "disabling should clear retained sparks and pixels once");

  harness.setEnabled(true);
  harness.runtime.start();
  staleCallback(16);
  assert.equal(harness.drawCount, 0, "a stale callback must not draw after settings are re-enabled");
  assert.equal(harness.pendingFrameCount, 1, "a stale callback must not disturb the newly started loop");
  harness.runNextFrame(32);
  assert.equal(harness.drawCount, 1);
}

{
  const harness = createAnimationHarness([true]);
  harness.setReducedMotion(true);
  harness.runtime.start();
  assertIdle(harness);

  harness.setReducedMotion(false);
  harness.runtime.start();
  harness.setReducedMotion(true);
  harness.runtime.stop(true);
  assert.equal(harness.pendingFrameCount, 0);
  assert.equal(harness.drawCount, 0, "reduced motion should prevent drawing");
  assert.equal(harness.canceledFrameIds.length, 1);
}

{
  const harness = createAnimationHarness([true]);
  harness.runtime.start();
  const staleCallback = harness.captureNextCallback();
  harness.runtime.dispose();
  assert.equal(harness.pendingFrameCount, 0);
  assert.equal(harness.canceledFrameIds.length, 1, "unmount should cancel the queued frame");

  staleCallback(16);
  harness.runtime.start();
  assert.equal(harness.drawCount, 0, "an unmounted loop must ignore stale callbacks");
  assert.equal(harness.pendingFrameCount, 0, "an unmounted loop must never restart");
}

const componentSource = readFileSync(resolve("components/layout/ClickSpark.tsx"), "utf8");
assert.match(componentSource, /const duration = 520/);
assert.match(componentSource, /const distance = eased \* 42 \* spark\.lengthScale/);
assert.match(componentSource, /const lineLength = 22 \* \(1 - eased\) \* spark\.lengthScale/);
assert.match(componentSource, /const sparkCount = 14/);
assert.match(componentSource, /index % 3 === 0 \? "#FFFFFF" : themeColor/);
assert.match(componentSource, /index % 2 === 0 \? 1\.2 : 0\.82/);
assert.match(componentSource, /Math\.round\(rect\.width \* ratio\)/);
assert.match(componentSource, /context\?\.setTransform\(ratio, 0, 0, ratio, 0, 0\)/);
assert.match(componentSource, /observer\.disconnect\(\)/);
assert.match(componentSource, /animationLoop\.dispose\(\)/);

console.log(JSON.stringify({ ok: true, clickSparkAnimationChecks: 36 }, null, 2));
