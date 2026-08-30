import type { createT, MessageKey } from "@/lib/i18n";
import type { LimitedJsonResult } from "@/lib/json-request";
import { ResponseBodyLimitExceededError } from "@/lib/bounded-response";
import { ClientRequestCancelledError, UpstreamTimeoutError } from "@/lib/upstream-control";

export type AppApiErrorCode =
  | "app_origin_configuration_error"
  | "cross_origin_request"
  | "missing_app_request_marker"
  | "unsupported_media_type"
  | "invalid_json"
  | "invalid_request"
  | "request_body_too_large"
  | "client_cancelled"
  | "upstream_timeout"
  | "upstream_response_too_large"
  | "song_search_failed"
  | "song_resolve_failed"
  | "lyrics_fetch_failed"
  | "song_parse_failed"
  | "local_audio_invalid_multipart"
  | "local_audio_missing_file"
  | "local_audio_unsupported_type"
  | "local_audio_too_large"
  | "local_audio_metadata_too_large"
  | "local_audio_parse_failed";

const defaultErrors: Record<AppApiErrorCode, string> = {
  app_origin_configuration_error: "The app origin policy is not configured correctly.",
  cross_origin_request: "Cross-origin requests are not allowed.",
  missing_app_request_marker: "This request did not come from the app.",
  unsupported_media_type: "This request uses an unsupported media type.",
  invalid_json: "Invalid JSON body.",
  invalid_request: "Invalid request.",
  request_body_too_large: "The request body is too large.",
  client_cancelled: "The request was cancelled by the client.",
  upstream_timeout: "The upstream service timed out.",
  upstream_response_too_large: "The upstream service returned too much data.",
  song_search_failed: "Unable to search songs.",
  song_resolve_failed: "Unable to resolve this song.",
  lyrics_fetch_failed: "Could not fetch lyrics automatically.",
  song_parse_failed: "Could not parse this link automatically. You can still enter the title, artist, and cover manually.",
  local_audio_invalid_multipart: "Invalid multipart form-data request.",
  local_audio_missing_file: "No audio file was provided.",
  local_audio_unsupported_type: "Only MP3, FLAC, and M4A files are supported.",
  local_audio_too_large: "The audio file is larger than the 100 MB limit.",
  local_audio_metadata_too_large: "The embedded audio metadata exceeds the supported limit.",
  local_audio_parse_failed: "Unable to parse this audio file."
};

const localizedKeys: Record<AppApiErrorCode, MessageKey> = {
  app_origin_configuration_error: "requestRejected",
  cross_origin_request: "requestRejected",
  missing_app_request_marker: "requestRejected",
  unsupported_media_type: "requestFormatUnsupported",
  invalid_json: "requestInvalid",
  invalid_request: "requestInvalid",
  request_body_too_large: "requestTooLarge",
  client_cancelled: "requestCancelled",
  upstream_timeout: "upstreamTimeout",
  upstream_response_too_large: "upstreamResponseTooLarge",
  song_search_failed: "songSearchFailed",
  song_resolve_failed: "songSearchResolveFailed",
  lyrics_fetch_failed: "lyricsFetchFailed",
  song_parse_failed: "parseError",
  local_audio_invalid_multipart: "requestInvalid",
  local_audio_missing_file: "localAudioNoFile",
  local_audio_unsupported_type: "localAudioUnsupportedType",
  local_audio_too_large: "localAudioTooLarge",
  local_audio_metadata_too_large: "localAudioMetadataTooLarge",
  local_audio_parse_failed: "localAudioFailed"
};

export function appApiErrorResponse(
  code: AppApiErrorCode,
  status: number,
  extra: Record<string, unknown> = {}
) {
  return Response.json({ ...extra, ok: false, error: defaultErrors[code], code }, { status });
}

export function getLocalizedAppApiError(
  code: AppApiErrorCode | undefined,
  t: ReturnType<typeof createT>,
  fallback: string
) {
  return code ? t(localizedKeys[code]) : fallback;
}

export function appLimitedJsonErrorResponse(reason: Exclude<LimitedJsonResult<unknown>, { ok: true }>["reason"]) {
  if (reason === "too_large") return appApiErrorResponse("request_body_too_large", 413);
  if (reason === "cancelled") return appApiErrorResponse("client_cancelled", 499);
  return appApiErrorResponse("invalid_json", 400);
}

export function appUpstreamErrorResponse(error: unknown, fallbackCode: AppApiErrorCode) {
  if (error instanceof ClientRequestCancelledError) {
    return appApiErrorResponse("client_cancelled", 499);
  }
  if (error instanceof UpstreamTimeoutError) {
    return appApiErrorResponse("upstream_timeout", 504);
  }
  if (error instanceof ResponseBodyLimitExceededError) {
    return appApiErrorResponse("upstream_response_too_large", 502);
  }
  return appApiErrorResponse(fallbackCode, 502);
}
