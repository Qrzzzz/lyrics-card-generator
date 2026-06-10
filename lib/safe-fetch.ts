import { validatePublicHttpUrl } from "@/lib/url-safety";

type UrlSafety = Awaited<ReturnType<typeof validatePublicHttpUrl>>;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type SafeFetchInit = RequestInit & {
  fetchImpl?: FetchLike;
  maxRedirects?: number;
  timeoutMs?: number;
  validateUrl?: (rawUrl: string) => Promise<UrlSafety>;
};

export async function fetchPublicUrl(rawUrl: string, init: SafeFetchInit = {}) {
  const {
    fetchImpl = fetch,
    maxRedirects = 5,
    timeoutMs = 10000,
    validateUrl = validatePublicHttpUrl,
    ...requestInit
  } = init;
  let currentUrl = rawUrl;
  let method = requestInit.method;
  let body = requestInit.body;
  const redirects: string[] = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const safety = await validateUrl(currentUrl);
    if (!safety.ok) {
      throw new Error(safety.error);
    }

    const response = await fetchImpl(safety.url.toString(), {
      ...requestInit,
      method,
      body,
      redirect: "manual",
      signal: requestInit.signal ?? AbortSignal.timeout(timeoutMs)
    });

    if (!isRedirectStatus(response.status)) {
      return {
        response,
        finalUrl: safety.url.toString(),
        redirects
      };
    }

    const location = response.headers.get("location");
    response.body?.cancel().catch(() => undefined);

    if (!location) {
      throw new Error(`Redirect response ${response.status} did not include a Location header.`);
    }

    if (redirectCount >= maxRedirects) {
      throw new Error("Too many redirects while fetching the URL.");
    }

    currentUrl = new URL(location, safety.url).toString();
    redirects.push(currentUrl);

    if (shouldRewriteRedirectToGet(response.status, method)) {
      method = "GET";
      body = undefined;
    }
  }

  throw new Error("Too many redirects while fetching the URL.");
}

export async function readTextWithLimit(response: Response, limit: number) {
  const bytes = await readBytesWithLimit(response, limit);
  return new TextDecoder("utf-8").decode(bytes);
}

export async function readBytesWithLimit(response: Response, limit: number) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > limit) {
    throw new Error("The response is too large.");
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > limit) {
      reader.cancel().catch(() => undefined);
      throw new Error("The response is too large.");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400 && status !== 304;
}

function shouldRewriteRedirectToGet(status: number, method?: string) {
  const normalizedMethod = method?.toUpperCase() || "GET";
  return status === 303 || ((status === 301 || status === 302) && normalizedMethod !== "GET" && normalizedMethod !== "HEAD");
}
