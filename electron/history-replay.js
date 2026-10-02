const path = require("node:path");
const { readValidatedImportFile, toPublicImportHistoryRecord } = require("./import-history");

/** No filesystem paths cross this interface without the history store/capability validation. */
function createHistoryReplayGateway({ draftAssets, fileStreams }) {
async function createImportHistoryReplayPayload(record, preparedFile, senderId) {
  if (record.editorDraft) {
    return { ok: true, kind: "draft", record: toPublicImportHistoryRecord(record),
      draft: await draftAssets.hydrate(record.id, record.editorDraft) };
  }
  if (record.kind === "link") {
    return {
      ok: true,
      kind: "link",
      record: toPublicImportHistoryRecord(record),
      ...(record.lyricsSnapshot ? { lyricsSnapshot: record.lyricsSnapshot } : {}),
      url: record.source.inputUrl || record.source.normalizedUrl || record.source.finalUrl
    };
  }
  if (record.kind === "search") {
    return {
      ok: true,
      kind: "search",
      record: toPublicImportHistoryRecord(record),
      ...(record.lyricsSnapshot ? { lyricsSnapshot: record.lyricsSnapshot } : {}),
      query: record.source.query,
      platform: record.source.platform,
      songId: record.source.songId,
      pageUrl: record.source.pageUrl || ""
    };
  }
  if (record.kind === "manual-save") {
    return {
      ok: true,
      kind: "manual-save",
      record: toPublicImportHistoryRecord(record),
      snapshot: record.snapshot
    };
  }

  try {
    if (record.kind === "local-audio") {
      const stream = await fileStreams.open(
        senderId,
        "local-audio",
        preparedFile?.path ?? record.source.path
      );
      if (!stream.ok) return { ok: false, code: stream.code, canRelocate: true };
      return {
        ok: true,
        kind: "local-audio",
        record: toPublicImportHistoryRecord(record),
        file: {
          streamToken: stream.streamToken,
          fileName: path.basename(stream.path),
          size: stream.size,
          mtimeMs: stream.mtimeMs,
          mimeType: mimeTypeForHistoryFile(stream.extension),
          changed: stream.size !== record.source.size || Math.abs(stream.mtimeMs - record.source.mtimeMs) > 1
        }
      };
    }
    const validated = preparedFile ?? await readValidatedImportFile(record.kind, record.source.path);
    if (!validated.ok) return { ok: false, code: validated.code, canRelocate: true };
    const changed = validated.size !== record.source.size || Math.abs(validated.mtimeMs - record.source.mtimeMs) > 1;
    const file = {
      // Bytes are returned for this replay only; history persists metadata and path, never file contents.
      bytes: validated.bytes,
      fileName: path.basename(validated.path),
      size: validated.size,
      mtimeMs: validated.mtimeMs,
      mimeType: mimeTypeForHistoryFile(validated.extension),
      changed
    };
    if (record.kind === "manual-cover") {
      return {
        ok: true,
        kind: "manual-cover",
        record: toPublicImportHistoryRecord(record),
        file,
        snapshot: record.snapshot
      };
    }
    return { ok: false, code: "unsupported_file_kind", canRelocate: true };
  } catch (error) {
    return {
      ok: false,
      code: error?.code === "ENOENT" ? "file_missing" : "file_invalid",
      canRelocate: true
    };
  }
}

function mimeTypeForHistoryFile(extension) {
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".flac") return "audio/flac";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}


  return { createPayload: createImportHistoryReplayPayload };
}
module.exports = { createHistoryReplayGateway };
