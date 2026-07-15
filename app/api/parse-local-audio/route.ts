import { parseBuffer } from "music-metadata";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import type { ParsedSongData } from "@/lib/types";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([".mp3", ".flac"]);
const ACCEPTED_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/flac", "audio/x-flac"]);

type NativeTag = {
  id?: string;
  value?: unknown;
};

export async function POST(req: Request) {
  const rejection = validateAppMutationRequest(req, "multipart/form-data");
  if (rejection) {
    return appMutationRejectionResponse(rejection);
  }

  let formData: FormData;

  try {
    formData = await req.formData();
  } catch {
    return appApiErrorResponse("local_audio_invalid_multipart", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return appApiErrorResponse("local_audio_missing_file", 400);
  }

  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.has(extension) && !ACCEPTED_MIME_TYPES.has(mimeType)) {
    return appApiErrorResponse("local_audio_unsupported_type", 415);
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return appApiErrorResponse("local_audio_too_large", 413);
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const metadata = await parseBuffer(bytes, { mimeType: mimeType || mimeTypeFromExtension(extension), path: file.name });
    const picture = metadata.common.picture?.[0];
    const coverUrl = picture
      ? `data:${picture.format || "image/jpeg"};base64,${Buffer.from(picture.data).toString("base64")}`
      : "";
    const lyrics = stripLrcTimestamps(extractLyrics(metadata));
    const data: ParsedSongData = {
      source: "unknown",
      title: metadata.common.title?.trim() || stripAudioExtension(file.name),
      artist: firstValue(metadata.common.artists) || metadata.common.artist?.trim() || "",
      album: metadata.common.album?.trim() || "",
      coverUrl,
      originalCoverUrl: "",
      proxiedCoverUrl: "",
      originalUrl: file.name,
      parseMethod: "local-audio-metadata",
      ...(lyrics ? { lyrics } : {})
    };

    return Response.json({
      ok: true,
      data,
      status: lyrics ? "success" : "no-lyrics",
      message: lyrics ? "Parsed metadata and embedded lyrics." : "Parsed metadata, but no embedded lyrics were found."
    });
  } catch {
    return appApiErrorResponse("local_audio_parse_failed", 422);
  }
}

function extractLyrics(metadata: Awaited<ReturnType<typeof parseBuffer>>) {
  const candidates: string[] = [];
  addLyricsValue(candidates, metadata.common.lyrics);

  for (const tags of Object.values(metadata.native)) {
    for (const tag of tags as NativeTag[]) {
      const id = String(tag.id ?? "").toUpperCase();
      if (
        id === "LYRICS" ||
        id === "UNSYNCEDLYRICS" ||
        id === "UNSYNCED LYRICS" ||
        id === "USLT" ||
        id === "SYLT" ||
        id.includes("LYRIC")
      ) {
        addLyricsValue(candidates, tag.value);
      }
    }
  }

  return candidates.map((candidate) => candidate.trim()).find(Boolean) ?? "";
}

function addLyricsValue(candidates: string[], value: unknown) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    candidates.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      addLyricsValue(candidates, item);
    }
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    addLyricsValue(candidates, record.text ?? record.lyrics ?? record.value);
  }
}

function stripLrcTimestamps(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+/g, "").trimEnd())
    .filter((line) => !/^\[(ar|ti|al|by|offset):/i.test(line.trim()))
    .join("\n")
    .trim();
}

function firstValue(values?: string[]) {
  return values?.map((value) => value.trim()).find(Boolean) ?? "";
}

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function stripAudioExtension(fileName: string) {
  return fileName.replace(/\.(mp3|flac)$/i, "");
}

function mimeTypeFromExtension(extension: string) {
  return extension === ".flac" ? "audio/flac" : "audio/mpeg";
}
