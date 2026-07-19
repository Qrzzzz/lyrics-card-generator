"use client";

import { FileText, WandSparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createAppRequestHeaders } from "@/lib/app-request";
import type { createT } from "@/lib/i18n";
import type { LyricsCandidate, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { songDocumentIdentity } from "@/lib/editor/document-transactions";

type FetchResponse =
  | { ok: true; data: LyricsCandidate }
  | { ok: false; error: string };

export function LyricsFetchPanel({
  song,
  available,
  documentRevision,
  onUseLyrics,
  t
}: {
  song: SongInfo;
  available: boolean;
  documentRevision: number;
  onUseLyrics: (lyrics: string, revision: number, songIdentity: string) => boolean;
  t: ReturnType<typeof createT>;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<{
    data: LyricsCandidate;
    revision: number;
    songIdentity: string;
  } | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const identity = songDocumentIdentity(song);

  useEffect(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setCandidate(null);
    setStatus("idle");
    setMessage("");
    setOpen(false);
  }, [documentRevision, identity]);

  useEffect(() => () => activeRequestRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function fetchLyrics() {
    if (!available) return;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const requestRevision = documentRevision;
    const requestIdentity = identity;
    setOpen(true);
    setStatus("loading");
    setMessage(t("fetchingLyrics"));
    setCandidate(null);

    try {
      const res = await fetch("/api/fetch-lyrics", {
        method: "POST",
        headers: createAppRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          source: song.source,
          url: song.originalUrl,
          title: song.title,
          artist: song.artist
        }),
        signal: controller.signal
      });
      const payload = (await res.json()) as FetchResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      if (controller.signal.aborted) return;
      setCandidate({ data: payload.data, revision: requestRevision, songIdentity: requestIdentity });
      setStatus("success");
      setMessage(`${t("lyricsSource")}: ${payload.data.source} · ${t("lyricsConfidence")}: ${Math.round(payload.data.confidence * 100)}%`);
    } catch {
      if (controller.signal.aborted) return;
      setStatus("error");
      setMessage(t("lyricsFetchFailed"));
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => void fetchLyrics()}
        disabled={!available || status === "loading"}
        className="app-button control-focus flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold transition disabled:cursor-default disabled:opacity-35"
        title={t("tryFetchLyrics")}
        aria-label={t("tryFetchLyrics")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="lyrics-fetch-panel"
        data-testid="lyrics-command-fetch"
      >
        <WandSparkles className={cn("size-3.5", status === "loading" && "animate-pulse")} />
        <span className="hidden min-[1080px]:inline">
          {status === "loading" ? t("fetchingLyrics") : t("tryFetchLyrics")}
        </span>
      </button>

      {open ? (
        <div
          id="lyrics-fetch-panel"
          role="dialog"
          aria-label={t("lyricsCandidate")}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100vh-12rem)] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--elevated-panel-bg))] p-3 shadow-2xl backdrop-blur-xl"
          data-testid="lyrics-fetch-panel-boundary"
        >
          <header className="mb-2 flex items-center justify-between gap-2 border-b border-[rgb(var(--panel-border))] pb-2">
            <div>
              <p className="app-text-subtle text-[9px] font-semibold uppercase tracking-[0.12em]">{t("tryFetchLyrics")}</p>
              <h3 className="app-text-primary mt-0.5 text-xs font-semibold">{t("lyricsCandidate")}</h3>
            </div>
            <button
              type="button"
              className="app-button control-focus flex size-7 items-center justify-center rounded-md"
              onClick={() => {
                setOpen(false);
                window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
              }}
              aria-label={t("titleBar.close")}
              data-testid="lyrics-fetch-close"
            >
              <X className="size-3.5" />
            </button>
          </header>

          <p className="app-text-subtle text-[10px] leading-relaxed">{t("lyricsFetchNotice")}</p>

          {message ? (
            <p
              className={cn(
                "mt-2 rounded-md border px-2.5 py-2 text-[11px]",
                status === "success" && "status-success",
                status === "error" && "status-danger",
                status === "loading" && "status-info"
              )}
              data-testid="lyrics-fetch-status"
            >
              {message}
            </p>
          ) : null}

          {candidate ? (
            <div className="mt-2 grid gap-2">
              <pre className="app-text-primary max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-2.5 text-[11px] leading-relaxed">
                {candidate.data.lyrics}
              </pre>
              <button
                type="button"
                onClick={() => {
                  if (onUseLyrics(candidate.data.lyrics, candidate.revision, candidate.songIdentity)) {
                    setCandidate(null);
                    setOpen(false);
                  }
                }}
                className="app-button control-focus inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[11px] font-semibold transition"
                data-testid="lyrics-fetch-use"
              >
                <FileText className="size-3.5" />
                {t("useFetchedLyrics")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
