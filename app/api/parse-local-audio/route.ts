import { parseWebStream } from "music-metadata";
import { appApiErrorResponse } from "@/lib/app-api-errors";
import { appMutationRejectionResponse, validateAppMutationRequest } from "@/lib/app-request";
import { localAudioFileSizeRejection, readLocalAudioMultipart } from "@/lib/local-audio-request";
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
    const metadata = await parseWebStream(file.stream(), {
      mimeType: mimeType || mimeTypeFromExtension(extension),
      path: file.name,
      size: file.size
    });
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

function extractLyrics(metadata: Awaited<ReturnType<typeof parseWebStream>>) {
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
