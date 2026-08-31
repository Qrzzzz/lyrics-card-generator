import { ResponseBodyLimitExceededError } from "@/lib/bounded-response";

export class ClientRequestCancelledError extends Error {
  constructor() {
    super("The client disconnected before the upstream operation completed.");
    this.name = "ClientRequestCancelledError";
  }
}

export class UpstreamTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`The upstream operation exceeded its ${timeoutMs} ms deadline.`);
    this.name = "UpstreamTimeoutError";
  }
}

/** Keeps one deadline active across response headers and bounded body reads. */
export async function withUpstreamDeadline<T>(
  clientSignal: AbortSignal | undefined,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>
) {
  const controller = new AbortController();
  let abortKind: "client" | "timeout" | null = null;
  const abortFromClient = () => {
    if (controller.signal.aborted) return;
    abortKind = "client";
    controller.abort(clientSignal?.reason);
  };
  if (clientSignal?.aborted) abortFromClient();
  else clientSignal?.addEventListener("abort", abortFromClient, { once: true });

  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    abortKind = "timeout";
    controller.abort(new UpstreamTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    return await raceWithAbort(operation(controller.signal), controller.signal);
  } catch (error) {
    if (error instanceof ResponseBodyLimitExceededError) throw error;
    if (abortKind === "client" || clientSignal?.aborted) {
      throw new ClientRequestCancelledError();
    }
    if (abortKind === "timeout") {
      throw new UpstreamTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    clientSignal?.removeEventListener("abort", abortFromClient);
  }
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => finish(() => reject(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}
