"use client";

import { FileText, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { LyricsCandidate, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type FetchResponse =
  | { ok: true; data: LyricsCandidate }
  | { ok: false; error: string };

export function LyricsFetchPanel({
  song,
  visible,
  onUseLyrics,
  t
}: {
  song: SongInfo;
  visible: boolean;
  onUseLyrics: (lyrics: string) => void;
  t: ReturnType<typeof createT>;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [candidate, setCandidate] = useState<LyricsCandidate | null>(null);

  if (!visible) {
    return null;
  }

  async function fetchLyrics() {
    setStatus("loading");
    setMessage(t("fetchingLyrics"));
    setCandidate(null);

    try {
      const res = await fetch("/api/fetch-lyrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: song.source,
          url: song.originalUrl,
          title: song.title,
          artist: song.artist
        })
      });
      const payload = (await res.json()) as FetchResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      setCandidate(payload.data);
      setStatus("success");
      setMessage(`${t("lyricsSource")}: ${payload.data.source} · ${t("lyricsConfidence")}: ${Math.round(payload.data.confidence * 100)}%`);
    } catch {
      setStatus("error");
      setMessage(t("lyricsFetchFailed"));
    }
  }

  return (
    <Section title={t("lyricsCandidate")} eyebrow={t("tryFetchLyrics")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="app-text-subtle text-sm">{t("lyricsFetchNotice")}</p>
        <button
          type="button"
          onClick={fetchLyrics}
          disabled={status === "loading"}
          className="app-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-65"
        >
          <WandSparkles className="h-4 w-4" />
          {status === "loading" ? t("fetchingLyrics") : t("tryFetchLyrics")}
        </button>
      </div>
      {message ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            status === "success" && "status-success",
            status === "error" && "status-danger",
            status === "loading" && "status-info"
          )}
        >
          {message}
        </p>
      ) : null}
      {candidate ? (
        <div className="grid gap-3">
          <pre className="app-text-primary max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-3 text-sm leading-relaxed">
            {candidate.lyrics}
          </pre>
          <button
            type="button"
            onClick={() => onUseLyrics(candidate.lyrics)}
            className="app-button inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition"
          >
            <FileText className="h-4 w-4" />
            {t("useFetchedLyrics")}
          </button>
        </div>
      ) : null}
    </Section>
  );
}
