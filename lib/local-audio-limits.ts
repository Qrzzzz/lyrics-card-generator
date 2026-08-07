export const MAX_LOCAL_AUDIO_BYTES = 100 * 1024 * 1024;

// Embedded metadata is copied into parser output and then expanded again in
// JSON (cover art also grows during base64 encoding), so it needs a smaller
// budget than the audio container itself.
export const MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES = 8 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_LYRICS_CHARACTERS = 256 * 1024;

// A browser-generated multipart body only adds a few hundred bytes around the
// file field. Keep a bounded allowance for the boundary and field metadata so
// an exact 100 MiB file remains valid without permitting another MiB of audio.
export const LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const MAX_LOCAL_AUDIO_REQUEST_BYTES = MAX_LOCAL_AUDIO_BYTES + LOCAL_AUDIO_MULTIPART_OVERHEAD_BYTES;

export function isLocalAudioFileTooLarge(
  file: Pick<Blob, "size">,
  maxBytes = MAX_LOCAL_AUDIO_BYTES
) {
  return file.size > maxBytes;
}
