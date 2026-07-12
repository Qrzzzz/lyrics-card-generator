import * as http from "node:http";
import * as https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import {
  validatePublicHttpUrl,
  type PublicUrlResolver,
  type ResolvedAddress
} from "@/lib/url-safety";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SafeFetchResult = {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  body: Uint8Array;
  text: () => string;
  json: <T>() => T;
};

export type SafeFetchOptions = {
  headers?: HeadersInit;
  method?: "GET" | "HEAD";
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  discardResponseBody?: boolean;
  allowedContentTypes?: string[];
  resolver?: PublicUrlResolver;
  transport?: SafeFetchTransport;
};

export type SafeFetchTransportRequest = {
  url: URL;
  address: ResolvedAddress;
  method: "GET" | "HEAD";
  headers: Headers;
  signal: AbortSignal;
  maxResponseBytes: number;
  allowedContentTypes: string[];
  discardResponseBody: boolean;
};

export type SafeFetchTransportResponse = {
  status: number;
  headers: Headers;
  body: Uint8Array;
};

export type SafeFetchTransport = (request: SafeFetchTransportRequest) => Promise<SafeFetchTransportResponse>;

export class SafeFetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UNSAFE_URL"
      | "TOO_MANY_REDIRECTS"
      | "INVALID_REDIRECT"
      | "TIMEOUT"
      | "BODY_TOO_LARGE"
      | "CONTENT_TYPE"
      | "NETWORK"
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

/**
 * Fetches an untrusted public resource with manual, preflighted redirects.
 * Every connection is pinned to an address from that hop's validated DNS
 * result, closing the validation/connect DNS-rebinding window.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  const allowedContentTypes = (options.allowedContentTypes ?? []).map((value) => value.toLowerCase());
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (!headers.has("accept-encoding")) headers.set("accept-encoding", "identity");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Safe fetch deadline exceeded."));
  }, timeoutMs);
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) abortFromCaller();

  try {
    let currentUrl = rawUrl;
    for (let redirectCount = 0; ; redirectCount += 1) {
      if (controller.signal.aborted) {
        throw abortError(timedOut);
      }

      const validation = await raceWithAbort(
        validatePublicHttpUrl(currentUrl, { resolver: options.resolver }),
        controller.signal,
        () => abortError(timedOut)
      );
      if (!validation.ok) {
        throw new SafeFetchError(validation.error, "UNSAFE_URL");
      }

      const response = await raceWithAbort(
        (options.transport ?? nodeTransport)({
          url: validation.url,
          address: validation.addresses[0],
          method,
          headers,
          signal: controller.signal,
          maxResponseBytes,
          allowedContentTypes,
          discardResponseBody: options.discardResponseBody ?? false
        }),
        controller.signal,
        () => abortError(timedOut)
      ).catch((error: unknown) => {
        if (controller.signal.aborted) throw abortError(timedOut);
        if (error instanceof SafeFetchError) throw error;
        throw new SafeFetchError(error instanceof Error ? error.message : "The network request failed.", "NETWORK");
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        if (response.body.byteLength > maxResponseBytes) {
          throw new SafeFetchError("The response body is too large.", "BODY_TOO_LARGE");
        }
        const contentType = (response.headers.get("content-type") ?? "").toLowerCase().split(";", 1)[0].trim();
        if (allowedContentTypes.length > 0 && !matchesContentType(contentType, allowedContentTypes)) {
          throw new SafeFetchError("The response content type is not allowed.", "CONTENT_TYPE");
        }
        return createResult(response, validation.url.toString());
      }
      if (redirectCount >= maxRedirects) {
        throw new SafeFetchError("The URL redirected too many times.", "TOO_MANY_REDIRECTS");
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new SafeFetchError("The redirect response did not include a valid Location header.", "INVALID_REDIRECT");
      }
      try {
        currentUrl = new URL(location, validation.url).toString();
      } catch {
        throw new SafeFetchError("The redirect Location is invalid.", "INVALID_REDIRECT");
      }
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function nodeTransport(request: SafeFetchTransportRequest): Promise<SafeFetchTransportResponse> {
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(request.headers.entries());
    headers.host = request.url.host;
    const requestOptions: https.RequestOptions = {
      protocol: request.url.protocol,
      hostname: request.address.address,
      family: request.address.family,
      port: request.url.port || undefined,
      method: request.method,
      path: `${request.url.pathname}${request.url.search}`,
      headers,
      signal: request.signal
    };
    if (request.url.protocol === "https:") {
      requestOptions.servername = request.url.hostname.replace(/^\[|\]$/g, "");
    }

    const client = request.url.protocol === "https:" ? https : http;
    const outgoing = client.request(requestOptions, (incoming) => {
      const responseHeaders = toHeaders(incoming.headers);
      const status = incoming.statusCode ?? 0;
      if (REDIRECT_STATUSES.has(status) || request.method === "HEAD" || request.discardResponseBody) {
        // We only need the headers for these paths. Draining an untrusted
        // response would let a redirect or discarded response stream without
        // the configured body budget, so close the connection immediately.
        incoming.destroy();
        resolve({ status, headers: responseHeaders, body: new Uint8Array() });
        return;
      }

      const contentType = (responseHeaders.get("content-type") ?? "").toLowerCase().split(";", 1)[0].trim();
      if (request.allowedContentTypes.length > 0 && !matchesContentType(contentType, request.allowedContentTypes)) {
        incoming.destroy();
        reject(new SafeFetchError("The response content type is not allowed.", "CONTENT_TYPE"));
        return;
      }

      const declaredLength = Number(responseHeaders.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > request.maxResponseBytes) {
        incoming.destroy();
        reject(new SafeFetchError("The response body is too large.", "BODY_TOO_LARGE"));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      incoming.on("data", (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > request.maxResponseBytes) {
          incoming.destroy(new SafeFetchError("The response body is too large.", "BODY_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => resolve({
        status,
        headers: responseHeaders,
        body: new Uint8Array(Buffer.concat(chunks, received))
      }));
      incoming.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function createResult(response: SafeFetchTransportResponse, url: string): SafeFetchResult {
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    url,
    headers: response.headers,
    body: response.body,
    text: () => new TextDecoder().decode(response.body),
    json: <T>() => JSON.parse(new TextDecoder().decode(response.body)) as T
  };
}

function matchesContentType(contentType: string, allowed: string[]) {
  return allowed.some((entry) => entry.endsWith("/") ? contentType.startsWith(entry) : contentType === entry);
}

function toHeaders(source: IncomingHttpHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, String(value));
  }
  return headers;
}

function abortError(timedOut: boolean) {
  return new SafeFetchError(
    timedOut ? "The request timed out." : "The request was aborted.",
    timedOut ? "TIMEOUT" : "NETWORK"
  );
}

function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  createAbortError: () => SafeFetchError
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  let removeAbortListener: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([operation, aborted]).finally(removeAbortListener);
}
