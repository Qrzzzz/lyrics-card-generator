import { parseFromTokenizer } from "music-metadata";
import { fromBlob } from "strtok3/core";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import {
  localAudioFileSizeRejection,
  localAudioMetadataSizeRejection,
  readLocalAudioMultipart
} from "@/lib/local-audio-request";
import type { ParsedSongData } from "@/lib/types";

export const runtime = "nodejs";

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

  const multipart = await readLocalAudioMultipart(req);
  if (!multipart.ok) {
    return multipart.response;
  }
  const { file } = multipart;

  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.has(extension) && !ACCEPTED_MIME_TYPES.has(mimeType)) {
    return appApiErrorResponse("local_audio_unsupported_type", 415);
  }

  const sizeRejection = localAudioFileSizeRejection(file);
  if (sizeRejection) {
    return sizeRejection;
  }

  try {
    // Preserve the previous parser precedence: a recognized browser MIME type
    // wins over a conflicting filename extension, while extension-only uploads
    // still retain their original path hint.
    const parserPath = mimeType === "audio/flac" || mimeType === "audio/x-flac"
      ? "upload.flac"
      : mimeType === "audio/mpeg" || mimeType === "audio/mp3"
        ? "upload.mp3"
        : file.name;
    const metadata = await parseLocalAudioMetadata(file, parserPath);
    const picture = metadata.common.picture?.[0];
    const rawLyrics = extractLyrics(metadata);
    const metadataSizeRejection = localAudioMetadataSizeRejection(metadata.common.picture, rawLyrics);
    if (metadataSizeRejection) {
      return metadataSizeRejection;
    }
    const coverUrl = picture
      ? `data:${picture.format || "image/jpeg"};base64,${pictureDataToBase64(picture.data)}`
      : "";
    const lyrics = stripLrcTimestamps(rawLyrics);
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

async function parseLocalAudioMetadata(file: Blob, parserPath: string) {
  const tokenizer = fromBlob(file, { fileInfo: { path: parserPath } });
  try {
    return await parseFromTokenizer(tokenizer, {});
  } finally {
    // Parser failures must not retain the Blob-backed tokenizer or its buffers.
    await tokenizer.close();
  }
}

function extractLyrics(metadata: Awaited<ReturnType<typeof parseFromTokenizer>>) {
  // Prefer the library's normalized field, then tolerate vendor-specific tag
  // shapes because MP3 and FLAC writers encode embedded lyrics inconsistently.
  const commonLyrics = firstLyricsValue(metadata.common.lyrics);
  if (commonLyrics) {
    return commonLyrics;
  }

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
        const lyrics = firstLyricsValue(tag.value);
        if (lyrics) {
          return lyrics;
        }
      }
    }
  }

  return "";
}

function firstLyricsValue(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return /\S/u.test(value) ? value : "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const lyrics = firstLyricsValue(item);
      if (lyrics) {
        return lyrics;
      }
    }
    return "";
  }

  if (typeof value === "object") {
    // Native tag readers may wrap the same payload under any of these keys.
    const record = value as Record<string, unknown>;
    return firstLyricsValue(record.text ?? record.lyrics ?? record.value);
  }

  return "";
}

function pictureDataToBase64(data: Uint8Array) {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
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
