import assert from "node:assert/strict";
import {
  enqueueToastNotice,
  expireToastNotices,
  getToastDurationMs,
  getVisibleToastNotices,
  pauseToastNotices,
  resumeToastNotices,
  type ToastNotice,
  type ToastTone
} from "../components/feedback/toast-queue";

const shortSuccessDuration = getToastDurationMs("Saved", "success");
const shortWarningDuration = getToastDurationMs("Please wait", "warning");
const shortErrorDuration = getToastDurationMs("Export failed", "error");
const longWarningDuration = getToastDurationMs(
  "This document still contains many non-empty logical lines and needs a longer reading window",
  "warning"
);
const cjkWarningDuration = getToastDurationMs(
  "当前内容仍有较多非空逻辑行，请删减原文或已启用的译文后重试",
  "warning"
);

assert.ok(shortSuccessDuration >= 2800 && shortSuccessDuration <= 5200);
assert.ok(shortWarningDuration >= 3800 && shortWarningDuration <= 8000);
assert.ok(shortErrorDuration >= 4200 && shortErrorDuration <= 8000);
assert.ok(longWarningDuration > shortWarningDuration, "longer Latin copy receives more reading time");
assert.ok(cjkWarningDuration > shortWarningDuration, "longer CJK copy receives more reading time");

let queue: ToastNotice[] = [];
queue = add(queue, 1, "first", "success", 0, 5000).notices;
queue = add(queue, 2, "middle", "warning", 0, 1000).notices;
queue = add(queue, 3, "latest", "error", 0, 3000).notices;
assert.deepEqual(getVisibleToastNotices(queue).map((notice) => notice.message), ["first", "middle", "latest"]);

queue = expireToastNotices(queue, 1001, 5, true) as ToastNotice[];
assert.deepEqual(
  getVisibleToastNotices(queue).map((notice) => notice.message),
  ["first", "latest"],
  "an independently expiring middle notice leaves stable neighbors in chronological order"
);

let repeatedQueue: ToastNotice[] = [];
repeatedQueue = add(repeatedQueue, 10, "same message", "warning", 0, 2000).notices;
repeatedQueue = add(repeatedQueue, 11, "another message", "success", 0, 4000).notices;
const repeated = add(repeatedQueue, 12, "same message", "warning", 750, 5000);
repeatedQueue = repeated.notices;
assert.equal(repeated.repeated, true);
assert.equal(repeatedQueue.length, 2, "an exact repeat does not create another stack item");
assert.equal(repeatedQueue[0].id, 10, "an exact repeat keeps the original stable identity");
assert.equal(repeatedQueue[0].revision, 1, "an exact repeat advances the refresh animation revision");
assert.equal(repeatedQueue[0].expiresAt, 5750, "an exact repeat refreshes only its own lifetime");
assert.equal(repeatedQueue[1].expiresAt, 4000, "neighboring notice lifetimes remain unchanged");

repeatedQueue = add(repeatedQueue, 13, "same message", "error", 800, 5000).notices;
assert.equal(repeatedQueue.length, 3, "the same copy with a different tone remains semantically distinct");

let capacityQueue: ToastNotice[] = [];
capacityQueue = add(capacityQueue, 20, "one", "success", 0, 5000, 3).notices;
capacityQueue = add(capacityQueue, 21, "two", "warning", 0, 1000, 3).notices;
capacityQueue = add(capacityQueue, 22, "three", "error", 0, 5000, 3).notices;
capacityQueue = add(capacityQueue, 23, "four", "success", 0, 4000, 3).notices;
assert.equal(capacityQueue[3].stage, "pending");
assert.equal(capacityQueue[3].expiresAt, null, "a queued notice does not spend its lifetime before display");

capacityQueue = expireToastNotices(capacityQueue, 1001, 3, true) as ToastNotice[];
assert.deepEqual(
  getVisibleToastNotices(capacityQueue).map((notice) => notice.message),
  ["one", "three", "four"],
  "a pending notice fills the exact gap left by a middle expiration"
);
const promoted = capacityQueue.find((notice) => notice.message === "four");
assert.equal(promoted?.expiresAt, 5001, "a promoted notice starts its full lifetime when shown");

const paused = pauseToastNotices(capacityQueue, 1500);
assert.ok(paused.filter((notice) => notice.stage === "visible").every((notice) => notice.expiresAt === null));
const resumed = resumeToastNotices(paused, 9000);
const resumedFirst = resumed.find((notice) => notice.message === "one");
assert.equal(resumedFirst?.expiresAt, 12500, "visibility pause preserves the remaining lifetime");

console.log(JSON.stringify({
  ok: true,
  shortSuccessDuration,
  shortWarningDuration,
  shortErrorDuration,
  longWarningDuration,
  cjkWarningDuration
}, null, 2));

function add(
  notices: ToastNotice[],
  id: number,
  message: string,
  tone: ToastTone,
  now: number,
  durationMs: number,
  capacity = 5
) {
  return enqueueToastNotice(notices, {
    id,
    message,
    tone,
    now,
    durationMs,
    capacity,
    running: true
  });
}
