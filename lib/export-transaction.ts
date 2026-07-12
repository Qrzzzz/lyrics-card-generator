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

export async function runExportTransaction<BlockingReason extends string, Node>({
  mutex,
  snapshot,
  mountSnapshot,
  validateSnapshot,
  captureSnapshot,
  unmountSnapshot
}: {
  mutex: ExportTransactionMutex;
  snapshot: ExportSnapshot;
  mountSnapshot: (snapshot: ExportSnapshot) => Promise<Node>;
  validateSnapshot: (snapshot: ExportSnapshot, node: Node) => BlockingReason | null;
  captureSnapshot: (snapshot: ExportSnapshot, node: Node) => Promise<void>;
  unmountSnapshot: () => void;
}): Promise<ExportTransactionResult<BlockingReason>> {
  // This executes before the first await, so same-turn calls cannot both enter.
  const release = mutex.tryAcquire();
  if (!release) return { ok: false, kind: "busy" };

  try {
    const node = await mountSnapshot(snapshot);
    const reason = validateSnapshot(snapshot, node);
    if (reason) return { ok: false, kind: "blocked", reason };
    await captureSnapshot(snapshot, node);
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: "error", error };
  } finally {
    unmountSnapshot();
    release();
  }
}

export async function waitForExportSnapshotNode(
  getNode: () => HTMLElement | null,
  snapshotId: string,
  timeoutMs = 5000
) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const node = getNode();
    if (node?.dataset.exportSnapshotId === snapshotId) {
      await document.fonts.ready;
      await nextAnimationFrame();
      await nextAnimationFrame();
      return node;
    }
    await nextAnimationFrame();
  }
  throw new Error("The export snapshot host did not become ready in time.");
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
