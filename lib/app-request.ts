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

export function validateAppMutationRequest(
  request: Request,
  expectedMediaType: AppMutationMediaType
): AppMutationRejection | null {
  if (!hasSameOrigin(request)) {
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

function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
