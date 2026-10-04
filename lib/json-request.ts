import {
  cancelRequestBody,
  contentLengthExceedsLimit,
  limitRequestBody,
  RequestBodyLimitExceededError
} from "@/lib/request-body-limit";

export type LimitedJsonResult =
  | { ok: true; value: unknown; bytesRead: number }
  | { ok: false; reason: "too_large" | "invalid_json" | "cancelled"; bytesRead: number };

/**
 * Applies the encoded-byte budget while the transport is being consumed. The
 * JSON parser is invoked only after the bounded stream has completed, so a
 * missing or dishonest Content-Length cannot force unbounded materialization.
 */
export async function readLimitedJson(request: Request, limitBytes: number): Promise<LimitedJsonResult> {
  if (contentLengthExceedsLimit(request, limitBytes)) {
    cancelRequestBody(request, new RequestBodyLimitExceededError(limitBytes));
    return { ok: false, reason: "too_large", bytesRead: 0 };
  }

  const limited = limitRequestBody(request, limitBytes);
  try {
    const value: unknown = await limited.request.json();
    return { ok: true, value, bytesRead: limited.bytesRead };
  } catch {
    if (limited.exceeded) {
      return { ok: false, reason: "too_large", bytesRead: limited.bytesRead };
    }
    return {
      ok: false,
      reason: request.signal.aborted ? "cancelled" : "invalid_json",
      bytesRead: limited.bytesRead
    };
  }
}
