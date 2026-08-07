import { appApiErrorResponse } from "@/lib/app-api-errors";

export const APP_REQUEST_HEADER_NAME = "x-lyrics-card-request";
export const APP_REQUEST_HEADER_VALUE = "1";

export type AppMutationMediaType = "application/json" | "multipart/form-data";
export type AppMutationRejectionCode =
  | "cross_origin_request"
  | "missing_app_request_marker"
  | "unsupported_media_type";

export type AppMutationRejection = {
  ok: false;
  code: AppMutationRejectionCode;
  status: 403 | 415;
};

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
  if (!hasAllowedRequestOrigin(request)) {
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

function hasAllowedRequestOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site")?.trim().toLowerCase() === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === getExternalRequestOrigin(request);
  } catch {
    return false;
  }
}

function getExternalRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  // The first forwarded value represents the client-facing hop when the local
  // Next.js service is reached through its trusted desktop proxy.
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? `${forwardedProto}:`
    : requestUrl.protocol;

  return host ? new URL(`${protocol}//${host}`).origin : requestUrl.origin;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? "";
}
