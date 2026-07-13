import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearLyricContent } from "../lib/clear-content";
import { defaultState } from "../components/editor/editor-defaults";
import {
  AITranslationOrchestrator,
  type AITranslationRunOptions,
  type AITranslationStreamEvents
} from "../lib/editor/ai-translation-orchestrator";
import { EditorDocumentStateAdapter } from "../lib/editor/editor-document-state-adapter";
import {
  applyEditorStyleChange,
  isDocumentSemanticStyleChange
} from "../lib/editor/apply-style-change";
import {
  canonicalSongInfo,
  DocumentTransactionController,
  replaceSongDocument,
  songDocumentIdentity
} from "../lib/editor/document-transactions";
import type { AppState, ParsedSongData } from "../lib/types";

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
      applyPartial: (value, expectedRevision, expectedSongIdentity) => {
        if (document.revision !== expectedRevision || document.songIdentity !== expectedSongIdentity) return false;
        translation = { ...value };
        writes.push(value.text);
        return true;
      },
      commitTerminal: (value, expectedRevision, expectedSongIdentity) => {
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

function createDeferredEditorHarness() {
  const controller = new DocumentTransactionController();
  let state: AppState = {
    ...defaultState,
    url: "https://music.example/song-a",
    song: canonicalSongInfo({
      source: "netease",
      title: "Song A",
      artist: "Artist A",
      album: "Album A",
      originalUrl: "https://music.example/song-a"
    }),
    lyrics: "lyrics A",
    translationText: "old A",
    translationEnabled: true,
    style: {
      ...defaultState.style,
      translationText: "old A",
      translationEnabled: true
    }
  };
  const queuedUpdates: Array<(current: AppState) => AppState> = [];
  const enqueuedAtRevision: number[] = [];
  const enqueue = (updater: (current: AppState) => AppState) => {
    enqueuedAtRevision.push(controller.currentRevision);
    queuedUpdates.push(updater);
  };

  function flushReactQueue() {
    while (queuedUpdates.length) {
      state = queuedUpdates.shift()!(state);
    }
  }

  const commitSynchronously = (updater: (current: AppState) => AppState) => {
    flushReactQueue();
    state = updater(state);
  };
  const adapter = new EditorDocumentStateAdapter(controller, enqueue, commitSynchronously, () => state);
  const orchestrator = new AITranslationOrchestrator<TranslationValue, Phase>();
  const ui = {
    translating: false,
    starts: 0,
    settlements: 0,
    cancellations: 0,
    invalidations: 0,
    failures: 0,
    translationAtCancellation: "",
    translationAtFailure: "",
    translationAtSettlement: ""
  };

  function options(stream: ReturnType<typeof deferredStream>): AITranslationRunOptions<TranslationValue, Phase> {
    return {
      revision: controller.currentRevision,
      songIdentity: songDocumentIdentity(state.song),
      previousTranslation: {
        text: state.style.translationText,
        enabled: state.style.translationEnabled
      },
      getCurrentDocument: () => ({
        revision: controller.currentRevision,
        songIdentity: songDocumentIdentity(state.song)
      }),
      applyPartial: (value, expectedRevision, expectedSongIdentity) => adapter.applyAIPartial(
        value,
        expectedRevision,
        expectedSongIdentity
      ),
      commitTerminal: (value, expectedRevision, expectedSongIdentity) => adapter.commitAITranslation(
        value,
        expectedRevision,
        expectedSongIdentity
      ),
      stream: stream.run,
      clean: (value) => value.trim(),
      toValue: (text) => ({ text, enabled: true }),
      createEmptyResponseError: () => new Error("empty"),
      onStart: () => {
        ui.translating = true;
        ui.starts += 1;
      },
      onStatus: () => undefined,
      onReasoning: () => undefined,
      onStreaming: () => undefined,
      onSuccess: () => undefined,
      onFailure: () => {
        ui.failures += 1;
        ui.translationAtFailure = state.translationText;
      },
      onCancelled: () => {
        ui.translating = false;
        ui.cancellations += 1;
        ui.translationAtCancellation = state.translationText;
      },
      onInvalidated: () => {
        ui.translating = false;
        ui.invalidations += 1;
      },
      onSettled: () => {
        ui.translating = false;
        ui.settlements += 1;
        ui.translationAtSettlement = state.translationText;
      }
    };
  }

  return {
    adapter,
    controller,
    enqueue,
    enqueuedAtRevision,
    flushReactQueue,
    options,
    orchestrator,
    ui,
    get state() { return state; },
    get queuedUpdateCount() { return queuedUpdates.length; }
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
    const rollback = harness.orchestrator.invalidate();
    assert.deepEqual(rollback, { text: "old A", enabled: true });
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

async function deferredReactMutationRollbackTest() {
  const songBParsed = {
    source: "qq",
    title: "Song B",
    artist: "Artist B",
    album: "Album B",
    originalUrl: "https://music.example/song-b"
  } satisfies ParsedSongData;
  const songB = canonicalSongInfo(songBParsed);
  const cases: Array<{
    label: string;
    mutation: (current: AppState) => AppState;
    assertResult: (state: AppState) => void;
  }> = [
    {
      label: "manual song metadata",
      mutation: (current) => ({ ...current, song: songB }),
      assertResult: (state) => {
        assert.equal(state.song.title, "Song B");
        assert.equal(state.translationText, "old A");
      }
    },
    {
      label: "manual lyrics",
      mutation: (current) => ({ ...current, lyrics: "user lyrics" }),
      assertResult: (state) => {
        assert.equal(state.lyrics, "user lyrics");
        assert.equal(state.translationText, "old A");
      }
    },
    {
      label: "manual url",
      mutation: (current) => ({ ...current, url: "https://music.example/manual" }),
      assertResult: (state) => {
        assert.equal(state.url, "https://music.example/manual");
        assert.equal(state.translationText, "old A");
      }
    },
    {
      label: "manual translation text",
      mutation: (current) => ({
        ...current,
        translationText: "user translation",
        style: { ...current.style, translationText: "user translation" }
      }),
      assertResult: (state) => assert.equal(state.translationText, "user translation")
    },
    {
      label: "manual translation toggle",
      mutation: (current) => ({
        ...current,
        translationEnabled: false,
        style: { ...current.style, translationEnabled: false }
      }),
      assertResult: (state) => {
        assert.equal(state.translationText, "old A");
        assert.equal(state.translationEnabled, false);
      }
    },
    {
      label: "instrumental content mode",
      mutation: (current) => applyEditorStyleChange(current, {
        ...current.style,
        contentMode: "instrumental",
        translationText: "",
        translationEnabled: false
      }),
      assertResult: (state) => {
        assert.equal(state.style.contentMode, "instrumental");
        assert.equal(state.translationText, "");
        assert.equal(state.style.translationText, "");
        assert.equal(state.translationEnabled, false);
        assert.equal(state.style.translationEnabled, false);
      }
    },
    {
      label: "clear",
      mutation: clearLyricContent,
      assertResult: (state) => {
        assert.equal(state.song.title, "");
        assert.equal(state.translationText, "");
        assert.equal(state.style.translationText, "");
      }
    },
    {
      label: "canonical import",
      mutation: (current) => replaceSongDocument(current, songBParsed, "lyrics B"),
      assertResult: (state) => {
        assert.equal(state.song.title, "Song B");
        assert.equal(state.lyrics, "lyrics B");
        assert.equal(state.translationText, "", "new documents cannot inherit song A's translation");
        assert.equal(state.style.translationText, "");
      }
    }
  ];

  for (const testCase of cases) {
    const harness = createDeferredEditorHarness();
    const stream = deferredStream();
    const running = harness.orchestrator.run(harness.options(stream));
    stream.emitPartial("partial A");
    assert.equal(harness.queuedUpdateCount, 1, `${testCase.label}: AI partial is deferred by React`);
    assert.equal(harness.state.translationText, "old A");
    harness.flushReactQueue();
    assert.equal(harness.state.translationText, "partial A");

    const rollback = harness.orchestrator.invalidate();
    assert.deepEqual(rollback, { text: "old A", enabled: true });
    const revision = harness.adapter.queueDocumentMutation(rollback, testCase.mutation);
    assert.equal(revision, 1);
    assert.equal(
      harness.enqueuedAtRevision.at(-1),
      0,
      `${testCase.label}: atomic rollback+mutation updater is queued before synchronous revision mutation`
    );
    assert.equal(harness.controller.currentRevision, 1);
    assert.equal(harness.state.translationText, "partial A", `${testCase.label}: React updater is still deferred`);

    harness.flushReactQueue();
    assert.notEqual(harness.state.translationText, "partial A", `${testCase.label}: partial A cannot survive`);
    assert.equal(harness.state.style.translationText, harness.state.translationText);
    testCase.assertResult(harness.state);

    stream.emitPartial(`late ${testCase.label}`);
    stream.resolve(`late final ${testCase.label}`);
    await running;
    harness.flushReactQueue();
    assert.notEqual(harness.state.translationText, `late ${testCase.label}`);
    assert.notEqual(harness.state.translationText, `late final ${testCase.label}`);
  }
}

async function deferredImportRollbackTest() {
  const harness = createDeferredEditorHarness();
  const stream = deferredStream();
  const running = harness.orchestrator.run(harness.options(stream));
  stream.emitPartial("partial A");
  harness.flushReactQueue();
  assert.equal(harness.state.translationText, "partial A");

  const intent = harness.controller.begin("link");
  const rollback = harness.orchestrator.invalidate();
  assert.equal(harness.adapter.queueRollback(rollback), true);
  assert.equal(harness.enqueuedAtRevision.at(-1), 0);
  const revision = harness.controller.tryCommit(intent);
  assert.equal(revision, 1);
  harness.enqueue((current) => replaceSongDocument(current, {
    source: "qq",
    title: "Song B",
    artist: "Artist B",
    originalUrl: "https://music.example/song-b"
  }, "lyrics B"));
  assert.equal(harness.state.translationText, "partial A");

  harness.flushReactQueue();
  assert.equal(harness.state.song.title, "Song B");
  assert.equal(harness.state.translationText, "");
  assert.equal(harness.state.style.translationText, "");
  stream.resolve("late song A final");
  await running;
  harness.flushReactQueue();
  assert.equal(harness.state.translationText, "");
}

async function batchedPartialAndMutationTest() {
  const harness = createDeferredEditorHarness();
  const stream = deferredStream();
  const running = harness.orchestrator.run(harness.options(stream));
  stream.emitPartial("partial A");
  assert.equal(harness.state.translationText, "old A");
  assert.equal(harness.queuedUpdateCount, 1);

  const rollback = harness.orchestrator.invalidate();
  const revision = harness.adapter.queueDocumentMutation(
    rollback,
    (current) => ({ ...current, lyrics: "latest user lyrics" })
  );
  assert.equal(revision, 1);
  assert.equal(harness.queuedUpdateCount, 2);
  harness.flushReactQueue();
  assert.equal(harness.state.lyrics, "latest user lyrics");
  assert.equal(harness.state.translationText, "old A");
  assert.equal(harness.state.style.translationText, "old A");

  stream.resolve("late final A");
  await running;
  harness.flushReactQueue();
  assert.equal(harness.state.translationText, "old A");
}

async function deferredCancelAndFailureRollbackTest() {
  {
    const harness = createDeferredEditorHarness();
    let translationAtAbort = "";
    const stream = deferredStream(() => {
      translationAtAbort = harness.state.translationText;
    });
    const running = harness.orchestrator.run(harness.options(stream));
    stream.emitPartial("partial A");
    harness.flushReactQueue();
    assert.equal(harness.state.translationText, "partial A");

    assert.equal(harness.orchestrator.cancel(), true);
    assert.equal(harness.state.translationText, "old A", "cancel commits rollback before returning");
    assert.equal(harness.queuedUpdateCount, 0);
    assert.equal(harness.state.translationText, "old A");
    assert.equal(harness.state.style.translationText, "old A");
    assert.equal(harness.ui.translationAtCancellation, "old A");
    assert.equal(translationAtAbort, "old A", "cancel rollback commits before abort");

    stream.emitPartial("late cancel delta");
    stream.resolve("late cancel final");
    await running;
    harness.flushReactQueue();
    assert.equal(harness.state.translationText, "old A");
  }

  {
    const harness = createDeferredEditorHarness();
    const stream = deferredStream();
    const running = harness.orchestrator.run(harness.options(stream));
    stream.emitPartial("partial A");
    harness.flushReactQueue();
    stream.reject(new Error("provider failed"));
    await running;
    assert.equal(harness.state.translationText, "old A", "failure rollback commits before run settles");
    assert.equal(harness.queuedUpdateCount, 0);
    assert.equal(harness.state.translationText, "old A");
    assert.equal(harness.state.style.translationText, "old A");
    assert.equal(harness.ui.translationAtFailure, "old A");
    assert.equal(harness.ui.translationAtSettlement, "old A");
  }
}

async function aiStartSupersedesPendingDocumentIntentsTest() {
  for (const kind of ["link", "example-enrichment"] as const) {
    const harness = createDeferredEditorHarness();
    const pendingIntent = harness.controller.begin(kind);
    const start = harness.adapter.beginAITranslation();

    assert.equal(start.revision, 1, `${kind}: AI start advances the shared document revision exactly once`);
    assert.equal(harness.controller.currentRevision, 1);
    assert.equal(pendingIntent.signal.aborted, true, `${kind}: AI start aborts the older import transport`);
    assert.equal(harness.controller.tryCommit(pendingIntent), null, `${kind}: older intent cannot commit after AI start`);

    const stream = deferredStream();
    const running = harness.orchestrator.run(harness.options(stream));
    stream.emitPartial(`partial after ${kind}`);
    harness.flushReactQueue();
    assert.equal(harness.state.translationText, `partial after ${kind}`);
    stream.resolve(`final after ${kind}`);
    await running;

    assert.equal(harness.state.translationText, `final after ${kind}`);
    assert.equal(harness.queuedUpdateCount, 0, `${kind}: final is committed before run settles`);
    assert.equal(harness.ui.translating, false);
    assert.equal(harness.ui.settlements, 1);
  }

  // A pending import may itself have queued rollback for an older AI run.
  // The newer AI start must drain that queue before taking its snapshot so
  // the old rollback cannot render over generation 2.
  {
    const harness = createDeferredEditorHarness();
    const oldStream = deferredStream();
    const oldRun = harness.orchestrator.run(harness.options(oldStream));
    oldStream.emitPartial("partial generation 1");
    harness.flushReactQueue();
    const pendingImport = harness.controller.begin("link");
    const rollback = harness.orchestrator.invalidate();
    assert.equal(harness.adapter.queueRollback(rollback), true);
    assert.equal(harness.queuedUpdateCount, 1);

    const start = harness.adapter.beginAITranslation();
    assert.equal(start.revision, 1);
    assert.equal(start.translation.text, "old A", "AI start snapshots after draining older rollback");
    assert.equal(harness.state.translationText, "old A");
    assert.equal(harness.queuedUpdateCount, 0);
    assert.equal(pendingImport.signal.aborted, true);
    assert.equal(harness.controller.tryCommit(pendingImport), null);

    const nextStream = deferredStream();
    const nextRun = harness.orchestrator.run(harness.options(nextStream));
    nextStream.emitPartial("partial generation 2");
    harness.flushReactQueue();
    oldStream.resolve("late final generation 1");
    await oldRun;
    assert.equal(harness.state.translationText, "partial generation 2");
    nextStream.resolve("final generation 2");
    await nextRun;
    assert.equal(harness.state.translationText, "final generation 2");
  }
}

async function terminalCommitPrecedesLaterDocumentMutationsTest() {
  const mutations: Array<{
    label: string;
    apply: (current: AppState) => AppState;
    assertResult: (state: AppState) => void;
  }> = [
    {
      label: "song",
      apply: (current) => ({
        ...current,
        song: canonicalSongInfo({ source: "qq", title: "Song B", artist: "Artist B" })
      }),
      assertResult: (state) => assert.equal(state.song.title, "Song B")
    },
    {
      label: "lyrics",
      apply: (current) => ({ ...current, lyrics: "manual lyrics B" }),
      assertResult: (state) => assert.equal(state.lyrics, "manual lyrics B")
    },
    {
      label: "url",
      apply: (current) => ({ ...current, url: "https://music.example/manual-b" }),
      assertResult: (state) => assert.equal(state.url, "https://music.example/manual-b")
    }
  ];

  for (const mutation of mutations) {
    const harness = createDeferredEditorHarness();
    const start = harness.adapter.beginAITranslation();
    assert.equal(start.revision, 1);
    const stream = deferredStream();
    const running = harness.orchestrator.run(harness.options(stream));
    stream.emitPartial("partial A");
    harness.flushReactQueue();
    assert.equal(harness.state.translationText, "partial A");

    stream.resolve("final A");
    await running;
    assert.equal(harness.state.translationText, "final A", `${mutation.label}: terminal write is committed before run resolves`);
    assert.equal(harness.queuedUpdateCount, 0);

    const rollback = harness.orchestrator.invalidate();
    assert.equal(rollback, undefined, `${mutation.label}: completed generation is no longer active`);
    assert.equal(harness.adapter.queueDocumentMutation(rollback, mutation.apply), 2);
    harness.flushReactQueue();
    mutation.assertResult(harness.state);
    assert.equal(harness.state.translationText, "final A");

    stream.emitPartial(`late ${mutation.label}`);
    assert.equal(harness.queuedUpdateCount, 0, `${mutation.label}: late delta cannot enqueue after terminal finish`);
    assert.equal(harness.state.translationText, "final A");
  }
}

async function replacementCommitsRollbackBeforeAbortTest() {
  const harness = createDeferredEditorHarness();
  const firstStart = harness.adapter.beginAITranslation();
  assert.equal(firstStart.revision, 1);
  let translationAtAbort = "";
  const first = deferredStream(() => {
    translationAtAbort = harness.state.translationText;
  });
  const firstRun = harness.orchestrator.run(harness.options(first));
  first.emitPartial("partial generation 1");
  harness.flushReactQueue();

  assert.equal(harness.orchestrator.prepareReplacement(), true);
  assert.equal(harness.state.translationText, "old A", "replacement rollback commits synchronously");
  assert.equal(translationAtAbort, "old A", "replacement rollback commits before transport abort");
  assert.equal(harness.queuedUpdateCount, 0);

  const secondStart = harness.adapter.beginAITranslation();
  assert.equal(secondStart.revision, 2, "replacement generation advances one new shared revision");
  const second = deferredStream();
  const secondRun = harness.orchestrator.run(harness.options(second));
  second.emitPartial("partial generation 2");
  harness.flushReactQueue();
  first.emitPartial("late generation 1");
  first.resolve("late final generation 1");
  await firstRun;
  assert.equal(harness.state.translationText, "partial generation 2");

  second.resolve("final generation 2");
  await secondRun;
  assert.equal(harness.state.translationText, "final generation 2");
  assert.equal(harness.ui.translating, false);
  assert.equal(harness.ui.settlements, 1, "only the current generation settles the shared UI");
}

function productionAdapterWiringTest() {
  const source = readFileSync("components/editor/hooks/useEditorActions.ts", "utf8");
  assert.match(source, /documentStateAdapter\.queueDocumentMutation\(rollback, mutation\)/);
  assert.match(source, /documentStateAdapter\.queueRollback\(onInvalidateDocument\(\)\)/);
  assert.match(source, /flushSync\(\(\) => setState\(updater\)\)/);
  assert.match(source, /onInvalidateDocument\("ai-start"\)/);
  assert.match(source, /documentStateAdapter\.beginAITranslation\(\)/);
  assert.match(source, /isDocumentSemanticStyleChange\(currentDocumentRef\.current\.style, nextStyle\)/);
  assert.doesNotMatch(source, /function markDocumentMutation/);
}

function styleMutationClassificationTest() {
  const current = defaultState.style;
  assert.equal(isDocumentSemanticStyleChange(current, { ...current, lyricFontSize: current.lyricFontSize + 1 }), false);
  assert.equal(isDocumentSemanticStyleChange(current, { ...current, contentMode: "instrumental" }), true);
  assert.equal(isDocumentSemanticStyleChange(current, { ...current, translationEnabled: true }), true);
  assert.equal(isDocumentSemanticStyleChange(current, { ...current, translationText: "translated" }), true);
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
  await deferredReactMutationRollbackTest();
  await deferredImportRollbackTest();
  await batchedPartialAndMutationTest();
  await deferredCancelAndFailureRollbackTest();
  await aiStartSupersedesPendingDocumentIntentsTest();
  await terminalCommitPrecedesLaterDocumentMutationsTest();
  await replacementCommitsRollbackBeforeAbortTest();
  await providerFailureRestoresCurrentDocumentTest();
  await newerGenerationWinsTest();
  styleMutationClassificationTest();
  productionAdapterWiringTest();
})().then(() => {
  console.log("AI translation production orchestration race tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
