import {
  AITranslationTransactionController,
  type AITranslationDocumentIntent
} from "@/lib/editor/ai-translation-transaction";

export type AITranslationDocument = {
  revision: number;
  songIdentity: string;
};

export type AITranslationStreamEvents<Phase> = {
  onStatus: (phase: Phase) => void;
  onReasoningDelta: (delta: string, accumulated: string) => void;
  onDelta: (delta: string, accumulated: string) => void;
};

export type AITranslationStreamFlushScheduler = (flush: () => void) => () => void;

export type AITranslationRunOptions<Value, Phase> = AITranslationDocument & {
  previousTranslation: Value;
  getCurrentDocument: () => AITranslationDocument;
  applyPartial: (value: Value, expectedRevision: number, expectedSongIdentity: string) => boolean;
  commitTerminal: (value: Value, expectedRevision: number, expectedSongIdentity: string) => boolean;
  stream: (signal: AbortSignal, events: AITranslationStreamEvents<Phase>) => Promise<string>;
  clean: (value: string) => string;
  toValue: (cleaned: string) => Value;
  /** Structured streams may be incomplete until the terminal JSON closes. */
  toPartialValue?: (cleaned: string) => Value | null;
  createEmptyResponseError: () => unknown;
  onStart: () => void;
  onStatus: (phase: Phase) => void;
  onReasoning: (accumulated: string) => void;
  onStreaming: (value: string) => void;
  onSuccess: (value: string) => void;
  onFailure: (error: unknown) => void;
  onCancelled: () => void;
  onInvalidated: () => void;
  onSettled: () => void;
  /**
   * Coalesces consecutive stream updates at the renderer boundary. The
   * scheduler must defer the callback and return a synchronous cancellation
   * function. Omitting it retains the immediate behavior used by non-renderer
   * callers and transaction tests.
   */
  scheduleStreamFlush?: AITranslationStreamFlushScheduler;
};

type ActiveRun<Value, Phase> = {
  intent: AITranslationDocumentIntent<Value>;
  controller: AbortController;
  options: AITranslationRunOptions<Value, Phase>;
  flushPending: () => void;
};

/**
 * Owns the generation token as well as the transport abort signal. A run is
 * invalidated synchronously before its transport is aborted, so providers or
 * desktop IPC implementations that ignore cancellation cannot write late
 * deltas/finals or settle UI belonging to a newer generation.
 */
export class AITranslationOrchestrator<Value, Phase> {
  private readonly transactions = new AITranslationTransactionController<Value>();
  private active: ActiveRun<Value, Phase> | null = null;

  async run(options: AITranslationRunOptions<Value, Phase>) {
    const replacement = this.stopActive("replace");
    const intent = this.transactions.begin(
      options.revision,
      options.songIdentity,
      replacement?.previous ?? options.previousTranslation
    );
    const active: ActiveRun<Value, Phase> = {
      intent,
      controller: new AbortController(),
      options,
      flushPending: () => undefined
    };
    this.active = active;
    options.onStart();

    const isCurrent = () => this.isCurrent(active);
    const writePartial = (value: Value) => isCurrent() && options.applyPartial(
      value,
      intent.revision,
      intent.songIdentity
    );
    const commitTerminal = (value: Value) => isCurrent() && options.commitTerminal(
      value,
      intent.revision,
      intent.songIdentity
    );
    type PendingStreamUpdate = {
      kind: "reasoning" | "content";
      accumulated: string;
    };
    let pendingUpdate: PendingStreamUpdate | null = null;
    let cancelScheduledFlush: (() => void) | null = null;

    const deliverPending = () => {
      const update = pendingUpdate;
      pendingUpdate = null;
      if (!update || !isCurrent()) return;
      if (update.kind === "reasoning") {
        options.onReasoning(update.accumulated);
        return;
      }
      const cleaned = options.clean(update.accumulated);
      options.onStreaming(cleaned || update.accumulated.trim());
      const partialValue = cleaned
        ? options.toPartialValue
          ? options.toPartialValue(cleaned)
          : options.toValue(cleaned)
        : null;
      if (partialValue && writePartial(partialValue)) {
        intent.hasWrittenPartial = true;
      }
    };
    const flushPending = () => {
      const cancel = cancelScheduledFlush;
      cancelScheduledFlush = null;
      cancel?.();
      deliverPending();
    };
    const queueUpdate = (update: PendingStreamUpdate) => {
      if (!options.scheduleStreamFlush) {
        pendingUpdate = update;
        deliverPending();
        return;
      }
      // Only consecutive updates of the same kind may merge. Providers that
      // interleave reasoning and content retain their original callback order.
      if (pendingUpdate && pendingUpdate.kind !== update.kind) {
        flushPending();
      }
      pendingUpdate = update;
      if (cancelScheduledFlush) return;
      cancelScheduledFlush = options.scheduleStreamFlush(() => {
        cancelScheduledFlush = null;
        deliverPending();
      });
    };
    active.flushPending = flushPending;

    try {
      const raw = await options.stream(active.controller.signal, {
        onStatus: (phase) => {
          if (!isCurrent()) return;
          // A status event that follows an undelivered chunk is an ordering
          // boundary even when the provider repeats the same phase.
          if (pendingUpdate) flushPending();
          options.onStatus(phase);
        },
        onReasoningDelta: (_delta, accumulated) => {
          if (isCurrent()) queueUpdate({ kind: "reasoning", accumulated });
        },
        onDelta: (_delta, accumulated) => {
          if (isCurrent()) queueUpdate({ kind: "content", accumulated });
        }
      });
      // A terminal result must synchronously publish the newest accumulated
      // text even when the next animation frame has not arrived.
      flushPending();
      const cleaned = options.clean(raw);
      if (!cleaned) throw options.createEmptyResponseError();
      if (!commitTerminal(options.toValue(cleaned))) {
        if (this.finish(active)) options.onSettled();
        return;
      }
      if (!this.finish(active)) return;
      try {
        options.onSuccess(cleaned);
      } finally {
        options.onSettled();
      }
    } catch (error) {
      // Error UI and rollback remain synchronous with the rejected stream; no
      // queued frame is allowed to publish after the terminal path.
      flushPending();
      if (!isCurrent()) return;
      if (intent.hasWrittenPartial) commitTerminal(intent.previousTranslation);
      if (!this.finish(active)) return;
      try {
        options.onFailure(error);
      } finally {
        options.onSettled();
      }
    }
  }

  cancel() {
    const active = this.active;
    if (!active) return false;
    // Preserve the last received text before the existing synchronous rollback
    // and cancellation callbacks, while cancelling the queued frame itself.
    active.flushPending();
    const current = this.isCurrent(active);
    if (current && active.intent.hasWrittenPartial) {
      active.options.commitTerminal(
        active.intent.previousTranslation,
        active.intent.revision,
        active.intent.songIdentity
      );
    }
    this.transactions.invalidate(active.intent);
    this.active = null;
    if (current) active.options.onCancelled();
    active.controller.abort();
    return current;
  }

  invalidate() {
    return this.stopActive("invalidate")?.previous;
  }

  prepareReplacement() {
    return Boolean(this.stopActive("replace"));
  }

  private stopActive(reason: "replace" | "invalidate") {
    const active = this.active;
    if (!active) return null;
    active.flushPending();
    const current = this.isCurrent(active);
    let previous: Value | undefined;
    if (current && active.intent.hasWrittenPartial) {
      if (reason === "invalidate") {
        previous = active.intent.previousTranslation;
      } else if (active.options.commitTerminal(
        active.intent.previousTranslation,
        active.intent.revision,
        active.intent.songIdentity
      )) {
        previous = active.intent.previousTranslation;
      }
    }
    this.transactions.invalidate(active.intent);
    this.active = null;
    if (reason === "invalidate") active.options.onInvalidated();
    active.controller.abort();
    return { previous };
  }

  private isCurrent(active: ActiveRun<Value, Phase>) {
    if (this.active !== active) return false;
    const document = active.options.getCurrentDocument();
    return this.transactions.isCurrent(active.intent, document.revision, document.songIdentity);
  }

  private finish(active: ActiveRun<Value, Phase>) {
    if (!this.isCurrent(active)) return false;
    this.transactions.invalidate(active.intent);
    this.active = null;
    return true;
  }
}
