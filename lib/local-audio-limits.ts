import resourceBudgets from "@/electron/resource-budgets.json";

export const MAX_LOCAL_AUDIO_BYTES = resourceBudgets.localAudio.fileBytes;

// Embedded metadata is copied into parser output and then expanded again in
// JSON (cover art also grows during base64 encoding), so it needs a smaller
// budget than the audio container itself.
export const MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES = resourceBudgets.localAudio.embeddedCoverBytes;
export const MAX_LOCAL_AUDIO_LYRICS_CHARACTERS = resourceBudgets.localAudio.lyricsCharacters;
export const MAX_LOCAL_AUDIO_TITLE_CHARACTERS = resourceBudgets.localAudio.titleCharacters;
export const MAX_LOCAL_AUDIO_ARTIST_CHARACTERS = resourceBudgets.localAudio.artistCharacters;
export const MAX_LOCAL_AUDIO_ALBUM_CHARACTERS = resourceBudgets.localAudio.albumCharacters;
export const MAX_LOCAL_AUDIO_PARSER_TOKEN_BYTES = resourceBudgets.localAudio.parserTokenBytes;
export const MAX_LOCAL_AUDIO_PARSER_TOTAL_READ_BYTES = resourceBudgets.localAudio.parserTotalReadBytes;

// A browser-generated multipart body only adds a few hundred bytes around the
// file field. Keep a bounded allowance for the boundary and field metadata so
// an exact 100 MiB file remains valid without permitting another MiB of audio.
export const LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES = resourceBudgets.localAudio.multipartOverheadBytes;
export const MAX_LOCAL_AUDIO_REQUEST_BYTES = MAX_LOCAL_AUDIO_BYTES + LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES;

export function isLocalAudioFileTooLarge(
  file: Pick<Blob, "size">,
  maxBytes = MAX_LOCAL_AUDIO_BYTES
) {
  return file.size > maxBytes;
}
