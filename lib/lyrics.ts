import type { LyricsCandidate } from "@/lib/types";

export function stripLrcTimestamps(lrc: string) {
  return lrc
    .split(/\r?\n/)
    .map((line) => line.replace(/^(\[[^\]]+\])+\s*/, "").trimEnd())
    .filter((line, index, lines) => line.trim() || lines[index - 1]?.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/feat\.?|ft\.?/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function similarity(a: string, b: string) {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.82;
  }

  const leftTokens = new Set(left.split(/\s+/));
  const rightTokens = new Set(right.split(/\s+/));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union > 0 ? intersection / union : 0;
}

export function rankLyricsCandidate(
  candidate: { trackName?: string; artistName?: string; plainLyrics?: string | null; syncedLyrics?: string | null },
  title: string,
  artist: string
): LyricsCandidate | null {
  const lyrics = candidate.plainLyrics?.trim() || stripLrcTimestamps(candidate.syncedLyrics ?? "");

  if (!lyrics) {
    return null;
  }

  const titleScore = similarity(candidate.trackName ?? "", title);
  const artistScore = artist.trim() ? similarity(candidate.artistName ?? "", artist) : titleScore;
  const confidence = Math.min(1, titleScore * 0.68 + artistScore * 0.32);

  if (confidence < 0.48) {
    return null;
  }

  return {
    lyrics,
    source: "lrclib",
    confidence,
    notice: "LRCLIB candidate lyrics"
  };
}
