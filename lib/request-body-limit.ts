export class RequestBodyLimitExceededError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Request body exceeded the ${limitBytes}-byte limit.`);
    this.name = "RequestBodyLimitExceededError";
  }
}

export type LimitedRequestBody = {
  request: Request;
  readonly bytesRead: number;
  readonly exceeded: boolean;
};

type StreamingRequestInit = RequestInit & { duplex: "half" };

export function contentLengthExceedsLimit(request: Request, limitBytes: number) {
  assertByteLimit(limitBytes);
  const rawLength = request.headers.get("content-length")?.trim();
  if (!rawLength || !/^\d+$/.test(rawLength)) {
    return false;
  }

  const normalizedLength = rawLength.replace(/^0+(?=\d)/, "");
  const normalizedLimit = String(limitBytes);
  return normalizedLength.length > normalizedLimit.length ||
    (normalizedLength.length === normalizedLimit.length && normalizedLength > normalizedLimit);
}

export function cancelRequestBody(request: Request, reason: unknown) {
  if (!request.body || request.body.locked) {
    return;
  }

  try {
    void request.body.cancel(reason).catch(() => {});
  } catch {
    // The response still needs to be stable if the upstream transport has
    // already closed or rejects cancellation.
  }
}

export function limitRequestBody(request: Request, limitBytes: number): LimitedRequestBody {
  assertByteLimit(limitBytes);
  if (!request.body) {
    return {
      request,
      bytesRead: 0,
      exceeded: false
    };
  }

  const reader = request.body.getReader();
  let bytesRead = 0;
  let exceeded = false;
  let released = false;

  function releaseReader() {
    if (!released) {
      reader.releaseLock();
      released = true;
    }
  }

  function cancelUpstream(reason: unknown) {
    if (released) {
      return;
    }
    try {
      const cancellation = reader.cancel(reason);
      releaseReader();
      void cancellation.catch(() => {});
    } catch {
      releaseReader();
    }
  }

  const limitedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          releaseReader();
          controller.close();
          return;
        }

        bytesRead += value.byteLength;
        if (bytesRead > limitBytes) {
          exceeded = true;
          const error = new RequestBodyLimitExceededError(limitBytes);
          cancelUpstream(error);
          controller.error(error);
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        releaseReader();
        controller.error(error);
      }
    },
    cancel(reason) {
      cancelUpstream(reason);
    }
  }, { highWaterMark: 0 });

  const init: StreamingRequestInit = {
    method: request.method,
    headers: request.headers,
    body: limitedBody,
    signal: request.signal,
    duplex: "half"
  };
  const limitedRequest = new Request(request.url, init);

  return {
    request: limitedRequest,
    get bytesRead() {
      return bytesRead;
    },
    get exceeded() {
      return exceeded;
    }
  };
}

function assertByteLimit(limitBytes: number) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 0) {
    throw new RangeError("Request body limit must be a non-negative safe integer.");
  }
}
