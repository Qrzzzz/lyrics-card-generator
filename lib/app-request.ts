import { appApiErrorResponse } from "@/lib/app-api-errors";

export const APP_REQUEST_HEADER_NAME = "x-lyrics-card-request";
export const APP_REQUEST_HEADER_VALUE = "1";
export const APP_CANONICAL_ORIGIN_ENV = "LYRICS_CARD_APP_ORIGIN";
export const APP_TRUST_PROXY_ENV = "LYRICS_CARD_TRUST_PROXY";

export type AppMutationMediaType = "application/json" | "multipart/form-data";
export type AppMutationRejectionCode =
  | "app_origin_configuration_error"
  | "cross_origin_request"
  | "missing_app_request_marker"
  | "unsupported_media_type";

export type AppMutationRejection = {
  ok: false;
  code: AppMutationRejectionCode;
  status: 403 | 415 | 503;
};

type AppOriginPolicy =
  | { ok: true; canonicalOrigin: string; requestMatchesDeployment: boolean }
  | { ok: false };

export function createAppRequestHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);
  headers.set(APP_REQUEST_HEADER_NAME, APP_REQUEST_HEADER_VALUE);
  return headers;
}

/**
 * Applies the local app's CSRF-style mutation gate: exact external origin,
 * explicit renderer marker, and an exact media type must all agree. This is a
 * request provenance check, not a substitute for validating the body schema.
 */
export function validateAppMutationRequest(
  request: Request,
  expectedMediaType: AppMutationMediaType
): AppMutationRejection | null {
  const originPolicy = getAppOriginPolicy(request);
  if (!originPolicy.ok) {
    return { ok: false, code: "app_origin_configuration_error", status: 503 };
  }

  if (
    !originPolicy.requestMatchesDeployment
    || !hasAllowedRequestOrigin(request, originPolicy.canonicalOrigin)
  ) {
    return { ok: false, code: "cross_origin_request", status: 403 };
  }

  if (request.headers.get(APP_REQUEST_HEADER_NAME) !== APP_REQUEST_HEADER_VALUE) {
    return { ok: false, code: "missing_app_request_marker", status: 403 };
  }

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType !== expectedMediaType) {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }

  return null;
}

export function appMutationRejectionResponse(rejection: AppMutationRejection) {
  return appApiErrorResponse(rejection.code, rejection.status);
}

function hasAllowedRequestOrigin(request: Request, canonicalOrigin: string) {
  if (request.headers.get("sec-fetch-site")?.trim().toLowerCase() === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  return origin !== null && parseCanonicalOrigin(origin) === canonicalOrigin;
}

function getAppOriginPolicy(request: Request): AppOriginPolicy {
  const configuredOriginValue = process.env[APP_CANONICAL_ORIGIN_ENV];
  const trustProxyValue = process.env[APP_TRUST_PROXY_ENV] ?? "0";
  if (trustProxyValue !== "0" && trustProxyValue !== "1") {
    return { ok: false };
  }

  if (!configuredOriginValue) {
    return { ok: false };
  }

  const canonicalOrigin = parseCanonicalOrigin(configuredOriginValue);
  if (!canonicalOrigin) {
    return { ok: false };
  }

  const requestMatchesDeployment = trustProxyValue !== "1"
    || getTrustedForwardedOrigin(request) === canonicalOrigin;
  return { ok: true, canonicalOrigin, requestMatchesDeployment };
}

function getTrustedForwardedOrigin(request: Request) {
  const forwardedHost = readSingleForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = readSingleForwardedValue(request.headers.get("x-forwarded-proto"));
  if (!forwardedHost || (forwardedProto !== "http" && forwardedProto !== "https")) {
    return null;
  }

  try {
    const url = new URL(`${forwardedProto}://${forwardedHost}`);
    if (
      url.protocol !== `${forwardedProto}:`
      || url.host !== forwardedHost
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function readSingleForwardedValue(value: string | null) {
  if (!value || value !== value.trim() || value.includes(",")) {
    return null;
  }
  return value;
}

function parseCanonicalOrigin(value: string) {
  if (!value || value !== value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
      || value !== url.origin
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
