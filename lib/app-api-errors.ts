import type { createT, MessageKey } from "@/lib/i18n";

export type AppApiErrorCode =
  | "cross_origin_request"
  | "missing_app_request_marker"
  | "unsupported_media_type"
  | "invalid_json"
  | "invalid_request"
  | "song_search_failed"
  | "song_resolve_failed"
  | "lyrics_fetch_failed"
  | "song_parse_failed"
  | "local_audio_invalid_multipart"
  | "local_audio_missing_file"
  | "local_audio_unsupported_type"
  | "local_audio_too_large"
  | "local_audio_parse_failed";

const defaultErrors: Record<AppApiErrorCode, string> = {
  cross_origin_request: "Cross-origin requests are not allowed.",
  missing_app_request_marker: "This request did not come from the app.",
  unsupported_media_type: "This request uses an unsupported media type.",
  invalid_json: "Invalid JSON body.",
  invalid_request: "Invalid request.",
  song_search_failed: "Unable to search songs.",
  song_resolve_failed: "Unable to resolve this song.",
  lyrics_fetch_failed: "Could not fetch lyrics automatically.",
  song_parse_failed: "Could not parse this link automatically. You can still enter the title, artist, and cover manually.",
  local_audio_invalid_multipart: "Invalid multipart form-data request.",
  local_audio_missing_file: "No audio file was provided.",
  local_audio_unsupported_type: "Only MP3, FLAC, and M4A files are supported.",
  local_audio_too_large: "The audio file is larger than the 100 MB limit.",
  local_audio_parse_failed: "Unable to parse this audio file."
};

const localizedKeys: Record<AppApiErrorCode, MessageKey> = {
  cross_origin_request: "requestRejected",
  missing_app_request_marker: "requestRejected",
  unsupported_media_type: "requestFormatUnsupported",
  invalid_json: "requestInvalid",
  invalid_request: "requestInvalid",
  song_search_failed: "songSearchFailed",
  song_resolve_failed: "songSearchResolveFailed",
  lyrics_fetch_failed: "lyricsFetchFailed",
  song_parse_failed: "parseError",
  local_audio_invalid_multipart: "requestInvalid",
  local_audio_missing_file: "localAudioNoFile",
  local_audio_unsupported_type: "localAudioUnsupportedType",
  local_audio_too_large: "localAudioTooLarge",
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
