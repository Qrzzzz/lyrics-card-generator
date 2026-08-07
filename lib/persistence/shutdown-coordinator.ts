export type PersistenceFlusher = () => Promise<void> | void;

export class ShutdownPersistenceError extends Error {
  constructor(readonly failures: Array<{ id: string; reason: unknown }>) {
    super(`Unable to flush ${failures.map(({ id }) => id).join(", ")}.`);
    this.name = "ShutdownPersistenceError";
  }
}

export class ShutdownCoordinator {
  private readonly flushers = new Map<string, PersistenceFlusher>();
  private inFlight: Promise<void> | null = null;

  register(id: string, flush: PersistenceFlusher) {
    this.flushers.set(id, flush);
    return () => {
      if (this.flushers.get(id) === flush) this.flushers.delete(id);
    };
  }

  flushAll(timeoutMs = 4_000) {
    // Concurrent close requests share one flush so persistence hooks are not
    // invoked twice while the first shutdown attempt is still pending.
    if (this.inFlight) return this.inFlight;
    const operation = this.runFlushers(timeoutMs);
    const tracked = operation.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    return tracked;
  }

  private async runFlushers(timeoutMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Persistence flush timed out.")), timeoutMs);
    });
    // Run independent stores in parallel and aggregate every failure. The
    // timeout bounds shutdown waiting but cannot forcibly cancel arbitrary hooks.
    const flush = Promise.all(Array.from(this.flushers, async ([id, run]) => {
      try {
        await run();
        return null;
      } catch (reason) {
        return { id, reason };
      }
    })).then((results) => {
      const failures = results.filter((result): result is { id: string; reason: unknown } => Boolean(result));
      if (failures.length) throw new ShutdownPersistenceError(failures);
    });

    try {
      await Promise.race([flush, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const shutdownCoordinator = new ShutdownCoordinator();
