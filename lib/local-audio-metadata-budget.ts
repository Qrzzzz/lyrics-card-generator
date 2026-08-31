import {
  MAX_LOCAL_AUDIO_ALBUM_CHARACTERS,
  MAX_LOCAL_AUDIO_ARTIST_CHARACTERS,
  MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES,
  MAX_LOCAL_AUDIO_LYRICS_CHARACTERS,
  MAX_LOCAL_AUDIO_PARSER_TOKEN_BYTES,
  MAX_LOCAL_AUDIO_PARSER_TOTAL_READ_BYTES,
  MAX_LOCAL_AUDIO_TITLE_CHARACTERS
} from "@/lib/local-audio-limits";

export class LocalAudioMetadataLimitExceededError extends Error {
  constructor(readonly budget: string) {
    super(`Local audio metadata exceeded the ${budget} budget.`);
    this.name = "LocalAudioMetadataLimitExceededError";
  }
}

/**
 * Intercepts token lengths before strtok3 allocates token.len bytes. This is a
 * format-agnostic ceiling: music-metadata has skipCovers, but no API that keeps
 * accepted cover art while streaming every cover payload through a size hook.
 */
export function limitLocalAudioMetadataTokenizer<T extends object>(
  tokenizer: T,
  maxTokenBytes = MAX_LOCAL_AUDIO_PARSER_TOKEN_BYTES,
  maxTotalReadBytes = MAX_LOCAL_AUDIO_PARSER_TOTAL_READ_BYTES
) {
  let requestedBytes = 0;

  const account = (bytes: unknown) => {
    if (!Number.isSafeInteger(bytes) || (bytes as number) < 0 || (bytes as number) > maxTokenBytes) {
      throw new LocalAudioMetadataLimitExceededError("parser-token");
    }
    requestedBytes += bytes as number;
    if (!Number.isSafeInteger(requestedBytes) || requestedBytes > maxTotalReadBytes) {
      throw new LocalAudioMetadataLimitExceededError("parser-total-read");
    }
  };

  return new Proxy(tokenizer, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "readToken" || property === "peekToken") {
        return (token: { len?: unknown }, ...args: unknown[]) => {
          account(token?.len);
          return Reflect.apply(value as (...callArgs: unknown[]) => unknown, target, [token, ...args]);
        };
      }
      if (property === "readBuffer" || property === "peekBuffer") {
        return (buffer: Uint8Array, options?: { length?: number }) => {
          account(options?.length ?? buffer.byteLength);
          return Reflect.apply(value as (...callArgs: unknown[]) => unknown, target, [buffer, options]);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

export function createLocalAudioMetadataObserver() {
  let coverBytes = 0;
  const textCharacters = { title: 0, artist: 0, album: 0, lyrics: 0 };
  const accountText = (
    value: unknown,
    limit: number,
    budget: keyof typeof textCharacters
  ) => {
    const remaining = limit - textCharacters[budget];
    textCharacters[budget] += textTreeCharacterLength(value, remaining, budget);
  };
  return (event: { tag?: { type?: string; id?: string; value?: unknown } }) => {
    const tag = event.tag;
    if (tag?.type !== "common") return;
    const id = tag.id?.toLowerCase();
    if (id === "picture") {
      const bytes = pictureByteLength(tag.value);
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_LOCAL_AUDIO_EMBEDDED_COVER_BYTES - coverBytes) {
        throw new LocalAudioMetadataLimitExceededError("embedded-cover");
      }
      coverBytes += bytes;
      return;
    }
    if (id === "title") accountText(tag.value, MAX_LOCAL_AUDIO_TITLE_CHARACTERS, "title");
    if (id === "artist" || id === "artists") {
      accountText(tag.value, MAX_LOCAL_AUDIO_ARTIST_CHARACTERS, "artist");
    }
    if (id === "album") accountText(tag.value, MAX_LOCAL_AUDIO_ALBUM_CHARACTERS, "album");
    if (id === "lyrics") accountText(tag.value, MAX_LOCAL_AUDIO_LYRICS_CHARACTERS, "lyrics");
  };
}

function pictureByteLength(value: unknown) {
  if (!value || typeof value !== "object") return -1;
  const data = (value as { data?: unknown }).data;
  return data && typeof data === "object" && "byteLength" in data
    ? Number((data as { byteLength: unknown }).byteLength)
    : -1;
}

function textTreeCharacterLength(value: unknown, limit: number, budget: string) {
  let length = 0;
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (item.length > limit - length) throw new LocalAudioMetadataLimitExceededError(budget);
      length += item.length;
      return;
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      for (const key of ["text", "lyrics", "value"]) {
        if (key in record) visit(record[key]);
      }
    }
  };

  visit(value);
  return length;
}
