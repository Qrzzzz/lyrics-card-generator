import assert from "node:assert/strict";
import {
  AITranslationOrchestrator,
  type AITranslationRunOptions,
  type AITranslationStreamEvents
} from "../lib/editor/ai-translation-orchestrator";

type TranslationValue = { text: string; enabled: boolean };
type Phase = "connecting" | "streaming" | "idle";

function deferredStream(onAbort?: () => void) {
  let events!: AITranslationStreamEvents<Phase>;
  let signal!: AbortSignal;
  let resolve!: (value: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    run(nextSignal: AbortSignal, nextEvents: AITranslationStreamEvents<Phase>) {
      signal = nextSignal;
      events = nextEvents;
      nextSignal.addEventListener("abort", () => onAbort?.(), { once: true });
      // Deliberately ignore abort. Provider and desktop IPC cancellation may
      // settle late, which is the production race this test must cover.
      return promise;
    },
    emitPartial(value: string) {
      events.onDelta(value, value);
    },
    emitReasoning(value: string) {
      events.onReasoningDelta(value, value);
    },
    resolve,
    reject,
    get signal() { return signal; }
  };
}

function createHarness() {
  const orchestrator = new AITranslationOrchestrator<TranslationValue, Phase>();
  let document = { revision: 0, songIdentity: "song-a" };
  let translation: TranslationValue = { text: "old A", enabled: true };
  const writes: string[] = [];
  const events = {
    starts: 0,
    successes: 0,
    failures: 0,
    cancellations: 0,
    invalidations: 0,
    settlements: 0,
    streaming: [] as string[],
    reasoning: [] as string[]
  };

  function options(stream: ReturnType<typeof deferredStream>): AITranslationRunOptions<TranslationValue, Phase> {
    return {
      ...document,
      previousTranslation: { ...translation },
      getCurrentDocument: () => ({ ...document }),
      applyTranslation: (value, expectedRevision, expectedSongIdentity) => {
        if (document.revision !== expectedRevision || document.songIdentity !== expectedSongIdentity) return false;
        translation = { ...value };
        writes.push(value.text);
        return true;
      },
      stream: stream.run,
      clean: (value) => value.trim(),
      toValue: (text) => ({ text, enabled: true }),
      createEmptyResponseError: () => new Error("empty"),
      onStart: () => { events.starts += 1; },
      onStatus: () => undefined,
      onReasoning: (value) => { events.reasoning.push(value); },
      onStreaming: (value) => { events.streaming.push(value); },
      onSuccess: () => { events.successes += 1; },
      onFailure: () => { events.failures += 1; },
      onCancelled: () => { events.cancellations += 1; },
      onInvalidated: () => { events.invalidations += 1; },
      onSettled: () => { events.settlements += 1; }
    };
  }

  return {
    orchestrator,
    options,
    events,
    writes,
    get document() { return document; },
    set document(value) { document = value; },
    get translation() { return translation; },
    set translation(value) { translation = value; }
  };
}

async function userCancelBlocksLateProviderTest() {
  const harness = createHarness();
  let cancelUiCountAtAbort = -1;
  let translationAtAbort = "";
  const stream = deferredStream(() => {
    cancelUiCountAtAbort = harness.events.cancellations;
    translationAtAbort = harness.translation.text;
  });
  const running = harness.orchestrator.run(harness.options(stream));
  stream.emitPartial("partial A");
  assert.equal(harness.translation.text, "partial A");

  assert.equal(harness.orchestrator.cancel(), true);
  assert.equal(harness.translation.text, "old A", "cancel synchronously restores the current document");
  assert.equal(harness.events.cancellations, 1, "cancel updates the current generation UI exactly once");
  assert.equal(stream.signal.aborted, true, "generation invalidation is followed by transport cancellation");
  assert.equal(cancelUiCountAtAbort, 1, "cancelled UI state is committed before aborting the transport");
  assert.equal(translationAtAbort, "old A", "partial recovery is committed before aborting the transport");

  stream.emitPartial("late delta A");
  stream.emitReasoning("late reasoning A");
  stream.resolve("late final A");
  await running;
  assert.equal(harness.translation.text, "old A");
  assert.deepEqual(harness.writes, ["partial A", "old A"], "late callbacks cannot write or self-cancel twice");
  assert.equal(harness.events.successes, 0);
  assert.equal(harness.events.failures, 0);
  assert.equal(harness.events.settlements, 0, "late finally cannot settle UI after synchronous cancellation");
  assert.deepEqual(harness.events.reasoning, []);
}

async function switchAndClearWinTest() {
  for (const next of [
    { revision: 1, songIdentity: "song-b", label: "switch" },
    { revision: 1, songIdentity: "song-a", label: "clear" }
  ]) {
    const harness = createHarness();
    const stream = deferredStream();
    const running = harness.orchestrator.run(harness.options(stream));
    stream.emitPartial("partial A");
    harness.orchestrator.invalidate();
    harness.document = { revision: next.revision, songIdentity: next.songIdentity };
    harness.translation = { text: "", enabled: false };
    stream.emitPartial(`late ${next.label}`);
    stream.resolve(`late final ${next.label}`);
    await running;
    assert.equal(harness.translation.text, "", `${next.label} must beat late delta/final/recovery`);
    assert.equal(harness.events.invalidations, 1);
    assert.equal(harness.events.successes, 0);
  }

  const staleHarness = createHarness();
  const staleStream = deferredStream();
  const staleRun = staleHarness.orchestrator.run(staleHarness.options(staleStream));
  staleStream.emitPartial("partial A");
  staleHarness.document = { revision: 1, songIdentity: "song-b" };
  staleHarness.translation = { text: "song B", enabled: true };
  staleHarness.orchestrator.invalidate();
  staleStream.resolve("late A");
  await staleRun;
  assert.equal(staleHarness.translation.text, "song B", "invalidation never rolls back a different revision/identity");
}

async function providerFailureRestoresCurrentDocumentTest() {
  const harness = createHarness();
  const stream = deferredStream();
  const running = harness.orchestrator.run(harness.options(stream));
  stream.emitPartial("partial A");
  stream.reject(new Error("provider failed"));
  await running;
  assert.equal(harness.translation.text, "old A");
  assert.deepEqual(harness.writes, ["partial A", "old A"]);
  assert.equal(harness.events.failures, 1);
  assert.equal(harness.events.settlements, 1);
}

async function newerGenerationWinsTest() {
  const harness = createHarness();
  const first = deferredStream();
  const firstRun = harness.orchestrator.run(harness.options(first));
  first.emitPartial("partial generation 1");

  const second = deferredStream();
  const secondRun = harness.orchestrator.run(harness.options(second));
  assert.equal(first.signal.aborted, true);
  assert.equal(harness.translation.text, "old A", "starting generation 2 restores generation 1's partial first");
  second.emitPartial("partial generation 2");
  first.emitPartial("late generation 1 delta");
  first.resolve("late generation 1 final");
  await firstRun;
  assert.equal(harness.translation.text, "partial generation 2");

  second.reject(new Error("generation 2 failed"));
  await secondRun;
  assert.equal(harness.translation.text, "old A", "generation 2 failure restores the pre-generation value");
  assert.equal(harness.events.successes, 0);
  assert.equal(harness.events.failures, 1);
}

void (async () => {
  await userCancelBlocksLateProviderTest();
  await switchAndClearWinTest();
  await providerFailureRestoresCurrentDocumentTest();
  await newerGenerationWinsTest();
})().then(() => {
  console.log("AI translation production orchestration race tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
