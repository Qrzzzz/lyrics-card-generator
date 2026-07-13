import assert from "node:assert/strict";
import { streamAITranslation } from "../lib/ai/client";
import type { LyricsCardDesktopApi } from "../lib/desktop-api";
import type { DesktopAIStreamEvent } from "../lib/ai/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function lateDesktopDataIsRejectedAfterAbort() {
  const final = deferred<string>();
  let listener: ((event: DesktopAIStreamEvent) => void) | undefined;
  let requestId = "";
  let cancelCount = 0;
  const desktop = {
    startAITranslation: (nextRequestId: string) => {
      requestId = nextRequestId;
      return final.promise;
    },
    cancelAITranslation: async () => {
      cancelCount += 1;
      return { cancelled: true, active: true };
    },
    onAITranslationChunk: (callback: (event: DesktopAIStreamEvent) => void) => {
      listener = callback;
      return () => { listener = undefined; };
    }
  } as Pick<LyricsCardDesktopApi, "startAITranslation" | "cancelAITranslation" | "onAITranslationChunk">;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { lyricsCardDesktop: desktop as LyricsCardDesktopApi }
  });

  const controller = new AbortController();
  const received: string[] = [];
  const running = streamAITranslation({
    prompt: "translate",
    reasoning: false,
    signal: controller.signal,
    onDelta: (delta) => received.push(delta)
  });
  listener?.({ requestId, kind: "content", delta: "before abort" });
  controller.abort();
  listener?.({ requestId, kind: "content", delta: "late chunk" });
  final.resolve("late final");

  await assert.rejects(running, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.deepEqual(received, ["before abort"]);
  assert.equal(cancelCount, 1);
}

async function alreadyAbortedSignalNeverStartsProvider() {
  let starts = 0;
  let cancels = 0;
  const desktop = {
    startAITranslation: async () => {
      starts += 1;
      return "unexpected";
    },
    cancelAITranslation: async () => {
      cancels += 1;
      return { cancelled: true, active: false };
    },
    onAITranslationChunk: () => () => undefined
  } as Pick<LyricsCardDesktopApi, "startAITranslation" | "cancelAITranslation" | "onAITranslationChunk">;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { lyricsCardDesktop: desktop as LyricsCardDesktopApi }
  });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(streamAITranslation({
    prompt: "translate",
    reasoning: false,
    signal: controller.signal
  }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(starts, 0);
  assert.equal(cancels, 1);
}

void (async () => {
  await lateDesktopDataIsRejectedAfterAbort();
  await alreadyAbortedSignalNeverStartsProvider();
  console.log("AI desktop cancellation behavior tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
