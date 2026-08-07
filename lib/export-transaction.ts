import type { ExportSnapshot } from "@/lib/export-snapshot";

export class ExportTransactionMutex {
  private locked = false;

  tryAcquire() {
    if (this.locked) return null;
    this.locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.locked = false;
    };
  }
}

export type ExportTransactionResult<BlockingReason extends string> =
  | { ok: true }
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "blocked"; reason: BlockingReason }
  | { ok: false; kind: "error"; error: unknown };

export class ExportTransactionTimeoutError extends Error {
  constructor(message = "The export operation timed out.") {
    super(message);
    this.name = "ExportTransactionTimeoutError";
  }
}

export async function runExportTransaction<BlockingReason extends string, Node>({
  mutex,
  snapshot,
  mountSnapshot,
  validateSnapshot,
  captureSnapshot,
  unmountSnapshot,
  timeoutMs = 10000
}: {
  mutex: ExportTransactionMutex;
  snapshot: ExportSnapshot;
  mountSnapshot: (snapshot: ExportSnapshot, signal: AbortSignal) => Promise<Node>;
  validateSnapshot: (snapshot: ExportSnapshot, node: Node) => BlockingReason | null;
  captureSnapshot: (snapshot: ExportSnapshot, node: Node, signal: AbortSignal) => Promise<void>;
  unmountSnapshot: () => void;
  timeoutMs?: number;
}): Promise<ExportTransactionResult<BlockingReason>> {
  // This executes before the first await, so same-turn calls cannot both enter.
  const release = mutex.tryAcquire();
  if (!release) return { ok: false, kind: "busy" };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new ExportTransactionTimeoutError());
  }, timeoutMs);

  try {
    const node = await raceWithAbort(mountSnapshot(snapshot, controller.signal), controller.signal);
    throwIfAborted(controller.signal);
    const reason = validateSnapshot(snapshot, node);
    if (reason) return { ok: false, kind: "blocked", reason };
    // Validation intentionally happens after the snapshot host has settled and
    // immediately before capture. Capture implementations must honor the signal
    // before performing their irreversible download step.
    await raceWithAbort(captureSnapshot(snapshot, node, controller.signal), controller.signal);
    throwIfAborted(controller.signal);
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: "error", error };
  } finally {
    clearTimeout(timeout);
    if (!controller.signal.aborted) controller.abort();
    unmountSnapshot();
    release();
  }
}

export async function waitForExportSnapshotNode(
  getNode: () => HTMLElement | null,
  snapshotId: string,
  signal?: AbortSignal,
  timeoutMs = 5000
) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new ExportTransactionTimeoutError("The export snapshot host did not become ready in time."));
  }, timeoutMs);

  try {
    while (true) {
      throwIfAborted(controller.signal);
      const node = getNode();
      if (node?.dataset.exportSnapshotId === snapshotId) {
        // Font readiness plus two paint frames lets React commit the isolated
        // snapshot and the browser resolve its final layout before capture.
        if ("fonts" in document) {
          await raceWithAbort(document.fonts.ready, controller.signal);
        }
        await raceWithAbort(nextAnimationFrame(), controller.signal);
        await raceWithAbort(nextAnimationFrame(), controller.signal);
        throwIfAborted(controller.signal);
        return node;
      }
      await raceWithAbort(nextAnimationFrame(), controller.signal);
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new ExportTransactionTimeoutError();
}

function raceWithAbort<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new ExportTransactionTimeoutError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason instanceof Error ? signal.reason : new ExportTransactionTimeoutError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}
