export type SaveState = "saved" | "pending" | "saving" | "error";

export type SaveSnapshot<T> = {
  signature: string;
  value: T;
};

export type SaveControllerState = {
  status: SaveState;
  desiredSignature?: string;
  persistedSignature?: string;
  inFlightSignature?: string;
};

type LatestSaveControllerOptions<T, R> = {
  persist: (snapshot: SaveSnapshot<T>) => Promise<R>;
  onStateChange?: (state: SaveState) => void;
  onPersisted?: (result: R, snapshot: SaveSnapshot<T>, isLatest: boolean) => void;
  onError?: (error: unknown, snapshot: SaveSnapshot<T>) => void;
};

export type LatestSaveController<T> = {
  resetPersisted: (snapshot: SaveSnapshot<T>) => void;
  setDesired: (snapshot: SaveSnapshot<T>) => void;
  flushLatest: () => Promise<void>;
  whenIdle: () => Promise<void>;
  needsPersistence: () => boolean;
  getState: () => SaveControllerState;
};

export function createLatestSaveController<T, R>({
  persist,
  onStateChange,
  onPersisted,
  onError
}: LatestSaveControllerOptions<T, R>): LatestSaveController<T> {
  let desiredSnapshot: SaveSnapshot<T> | undefined;
  let persistedSignature: string | undefined;
  let inFlightSignature: string | undefined;
  let failedDesiredSignature: string | undefined;
  let status: SaveState = "saved";
  let runningPromise: Promise<void> | null = null;

  function emitState(nextState: SaveState) {
    if (status === nextState) return;
    status = nextState;
    onStateChange?.(nextState);
  }

  function refreshIdleState() {
    if (runningPromise || inFlightSignature) {
      emitState("saving");
      return;
    }

    if (desiredSnapshot && failedDesiredSignature === desiredSnapshot.signature) {
      emitState("error");
      return;
    }

    emitState(
      !desiredSnapshot || desiredSnapshot.signature === persistedSignature
        ? "saved"
        : "pending"
    );
  }

  function resetPersisted(snapshot: SaveSnapshot<T>) {
    if (runningPromise) {
      throw new Error("Cannot reset AI settings persistence while a save is running.");
    }
    desiredSnapshot = snapshot;
    persistedSignature = snapshot.signature;
    inFlightSignature = undefined;
    failedDesiredSignature = undefined;
    emitState("saved");
  }

  function setDesired(snapshot: SaveSnapshot<T>) {
    if (desiredSnapshot?.signature !== snapshot.signature) {
      failedDesiredSignature = undefined;
    }
    desiredSnapshot = snapshot;
    refreshIdleState();
  }

  async function drainLatest() {
    while (desiredSnapshot && desiredSnapshot.signature !== persistedSignature) {
      const snapshot = desiredSnapshot;
      inFlightSignature = snapshot.signature;
      emitState("saving");

      try {
        const result = await persist(snapshot);
        persistedSignature = snapshot.signature;
        inFlightSignature = undefined;
        const isLatest = desiredSnapshot?.signature === snapshot.signature;
        onPersisted?.(result, snapshot, isLatest);
      } catch (error) {
        // A rejected response may still have reached durable storage. Treat the
        // backend value as unknown and always replay the latest desired value.
        persistedSignature = undefined;
        inFlightSignature = undefined;
        if (desiredSnapshot?.signature === snapshot.signature) {
          failedDesiredSignature = snapshot.signature;
          onError?.(error, snapshot);
          emitState("error");
          return;
        }
      }
    }

    failedDesiredSignature = undefined;
    emitState("saved");
  }

  function flushLatest() {
    if (runningPromise) return runningPromise;
    if (!desiredSnapshot || desiredSnapshot.signature === persistedSignature) {
      refreshIdleState();
      return Promise.resolve();
    }

    failedDesiredSignature = undefined;
    const operation = Promise.resolve().then(drainLatest);
    const trackedOperation = operation.finally(() => {
      if (runningPromise === trackedOperation) {
        runningPromise = null;
        inFlightSignature = undefined;
        refreshIdleState();
      }
    });
    runningPromise = trackedOperation;
    emitState("saving");
    return trackedOperation;
  }

  async function whenIdle() {
    while (runningPromise) {
      await runningPromise;
    }
  }

  return {
    resetPersisted,
    setDesired,
    flushLatest,
    whenIdle,
    needsPersistence: () =>
      Boolean(runningPromise) ||
      Boolean(desiredSnapshot && desiredSnapshot.signature !== persistedSignature),
    getState: () => ({
      status,
      desiredSignature: desiredSnapshot?.signature,
      persistedSignature,
      inFlightSignature
    })
  };
}
