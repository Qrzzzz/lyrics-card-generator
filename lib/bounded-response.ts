import { contentLengthHeaderExceedsLimit } from "@/lib/request-body-limit";

export class ResponseBodyLimitExceededError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Response body exceeded the ${limitBytes}-byte limit.`);
    this.name = "ResponseBodyLimitExceededError";
  }
}

export async function readResponseBytesBounded(
  response: Response,
  limitBytes: number,
  signal?: AbortSignal
) {
  if (contentLengthHeaderExceedsLimit(response.headers, limitBytes)) {
    const error = new ResponseBodyLimitExceededError(limitBytes);
    await cancelResponseBody(response, error);
    throw error;
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await readWithSignal(reader, signal);
      if (done) break;

      // Fetch exposes decoded bytes here (including transparently decompressed
      // HTTP responses), so this is the actual post-content-encoding budget.
      bytesRead += value.byteLength;
      if (bytesRead > limitBytes) {
        const error = new ResponseBodyLimitExceededError(limitBytes);
        await safeCancel(reader, error);
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cancellation may still be settling; the body has already been closed.
    }
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readResponseTextBounded(
  response: Response,
  limitBytes: number,
  signal?: AbortSignal
) {
  return new TextDecoder().decode(await readResponseBytesBounded(response, limitBytes, signal));
}

export async function readResponseJsonBounded<T>(
  response: Response,
  limitBytes: number,
  signal?: AbortSignal
) {
  return JSON.parse(await readResponseTextBounded(response, limitBytes, signal)) as T;
}

async function cancelResponseBody(response: Response, reason: unknown) {
  if (!response.body || response.body.locked) return;
  try {
    await response.body.cancel(reason);
  } catch {
    // Stable limit classification takes precedence over transport cleanup noise.
  }
}

async function safeCancel(reader: ReadableStreamDefaultReader<Uint8Array>, reason: unknown) {
  try {
    await reader.cancel(reason);
  } catch {
    // Preserve the resource-control error that initiated cancellation.
  }
}

function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      operation();
    };
    const onAbort = () => {
      const reason = abortReason(signal);
      void reader.cancel(reason).catch(() => {});
      finish(() => reject(reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error))
    );
  });
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The response read was aborted.", "AbortError");
}
