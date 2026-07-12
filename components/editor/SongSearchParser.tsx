"use client";

import { Search, Music2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ActionButton, Input, Label, Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type {
  ResolveSearchedSongResponse,
  SearchSongResponse,
  SongSearchResult
} from "@/lib/music-search/types";
import type { ParsedSongData } from "@/lib/types";
import { cn } from "@/lib/utils";

type SearchStatus = "idle" | "typing" | "loading" | "success" | "partial" | "empty" | "error";

export function SongSearchParser({
  onResolved,
  t
}: {
  onResolved: (song: ParsedSongData, lyrics?: string) => void;
  t: ReturnType<typeof createT>;
}) {
  const listboxId = useId();
  const statusId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SongSearchResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [message, setMessage] = useState(t("songSearchNeedMoreInput"));
  const [expanded, setExpanded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const latestRequestRef = useRef(0);
  const skipNextSearchRef = useRef(false);
  const cacheRef = useRef(new Map<string, SongSearchResult[]>());

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      latestRequestRef.current += 1;
      setSuggestions([]);
      setExpanded(false);
      return;
    }

    const keyword = query.trim();

    if (!keyword) {
      latestRequestRef.current += 1;
      setSuggestions([]);
      setExpanded(false);
      setStatus("idle");
      setMessage(t("songSearchNeedMoreInput"));
      return;
    }

    if (!shouldSearch(keyword)) {
      latestRequestRef.current += 1;
      setSuggestions([]);
      setExpanded(false);
      setStatus("typing");
      setMessage(t("songSearchNeedMoreInput"));
      return;
    }

    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    const controller = new AbortController();
    const delay = containsCjk(keyword) && keyword.length === 1 ? 500 : 350;
    const timer = window.setTimeout(() => {
      void search(keyword, controller.signal, requestId, 8);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, t]);

  async function search(keyword: string, signal: AbortSignal, requestId: number, limit: number) {
    const cacheKey = `${keyword.toLowerCase()}::${limit}`;
    const cached = cacheRef.current.get(cacheKey);

    if (cached) {
      if (requestId !== latestRequestRef.current) return;
      setSuggestions(cached);
      setHighlightedIndex(0);
      setExpanded(cached.length > 0);
      setStatus(cached.length > 0 ? "success" : "empty");
      setMessage(cached.length > 0 ? t("songSearchSelectHint") : t("songSearchEmpty"));
      return;
    }

    setStatus("loading");
    setMessage(t("songSearchLoading"));

    try {
      const response = await fetch("/api/search-song", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword, limit }),
        signal
      });
      const payload = (await response.json()) as SearchSongResponse;

      if (requestId !== latestRequestRef.current) return;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      cacheRef.current.set(cacheKey, payload.data);
      setSuggestions(payload.data);
      setHighlightedIndex(0);
      setExpanded(payload.data.length > 0);
      setStatus(payload.data.length > 0 ? "success" : "empty");
      setMessage(payload.data.length > 0 ? t("songSearchSelectHint") : t("songSearchEmpty"));
    } catch (error) {
      if (signal.aborted) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("songSearchFailed"));
    }
  }

  async function searchMore() {
    if (isResolving) {
      return;
    }

    const keyword = query.trim();
    if (!shouldSearch(keyword)) {
      return;
    }

    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    const controller = new AbortController();
    await search(keyword, controller.signal, requestId, 20);
  }

  async function resolveSong(song: SongSearchResult) {
    if (isResolving) {
      return;
    }

    setIsResolving(true);
    setStatus("loading");
    setMessage(t("songSearchResolving"));

    try {
      const response = await fetch("/api/resolve-searched-song", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "netease", id: song.id })
      });
      const payload = (await response.json()) as ResolveSearchedSongResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      onResolved(payload.data.song, payload.data.lyrics);
      skipNextSearchRef.current = true;
      setQuery(`${payload.data.song.title} - ${payload.data.song.artist}`);
      setExpanded(false);
      setSuggestions([]);
      setStatus(payload.data.lyrics ? "success" : "partial");
      setMessage(payload.data.lyrics ? t("songSearchImportedWithLyrics") : t("songSearchImportedNoLyrics"));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("songSearchResolveFailed"));
    } finally {
      setIsResolving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab") {
      setExpanded(false);
      return;
    }

    if (event.key === "ArrowDown") {
      if (suggestions.length > 0) {
        event.preventDefault();
        setExpanded(true);
        setHighlightedIndex((index) => (index + 1) % suggestions.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      if (suggestions.length > 0) {
        event.preventDefault();
        setExpanded(true);
        setHighlightedIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      }
      return;
    }

    if (event.key === "Enter") {
      const selected = expanded ? suggestions[highlightedIndex] : suggestions[0];
      if (selected) {
        event.preventDefault();
        void resolveSong(selected);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
    }
  }

  return (
    <Section
      title={t("songSearchTitle")}
      eyebrow={t("songSearchSourceNetease")}
      variant="card"
      className="song-search-focus overflow-visible"
      contentClassName="gap-5"
    >
      <p className="app-text-subtle max-w-2xl text-sm leading-6">{t("songSearchDescription")}</p>
      <Label label={t("songSearchInput")} description={t("songSearchKeyboardHint")}>
        <div className="relative">
          <Search className="app-text-subtle pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setExpanded(suggestions.length > 0)}
            onBlur={() => window.setTimeout(() => setExpanded(false), 150)}
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listboxId}
            aria-activedescendant={
              expanded && suggestions[highlightedIndex]
                ? `${listboxId}-option-${highlightedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-label={t("songSearchInput")}
            aria-describedby={statusId}
            aria-busy={status === "loading"}
            placeholder={t("songSearchPlaceholder")}
            disabled={isResolving}
            className="h-14 rounded-xl pl-12 pr-4 text-base shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
          />
          {expanded && suggestions.length > 0 ? (
            <div
              className="glass-panel absolute z-30 mt-2 w-full overflow-hidden rounded-xl border p-2 shadow-2xl backdrop-blur-xl"
              data-testid="song-search-popup"
            >
              <div
                id={listboxId}
                role="listbox"
                aria-label={t("songSearchTitle")}
                className="max-h-[min(22rem,44vh)] overflow-y-auto overscroll-contain"
                data-testid="song-search-listbox"
              >
                {suggestions.map((song, index) => (
                  <button
                    key={song.id}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === highlightedIndex}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void resolveSong(song)}
                    disabled={isResolving}
                    className={cn(
                      "control-focus control-disabled flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition",
                      index === highlightedIndex ? "bg-white/10" : "hover:bg-white/10"
                    )}
                  >
                    {song.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={song.coverUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="control-surface inline-flex size-12 shrink-0 items-center justify-center rounded-md">
                        <Music2 className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="app-text-primary block truncate text-sm font-medium">
                        {song.title} {song.artist ? `- ${song.artist}` : ""}
                      </span>
                      <span className="app-text-subtle mt-1 block truncate text-xs">
                        {[song.album, formatDuration(song.durationMs)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="app-text-subtle shrink-0 text-[11px]">{t("songSearchSourceNetease")}</span>
                  </button>
                ))}
              </div>
              {suggestions.length >= 8 ? (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    loading={status === "loading"}
                    disabled={isResolving}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void searchMore()}
                    data-testid="song-search-more"
                  >
                    {t("songSearchMore")}
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Label>
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          status === "success" && "status-success",
          status === "partial" && "status-warning",
          status === "error" && "status-danger",
          status === "loading" && "status-info",
          (status === "idle" || status === "typing" || status === "empty") && "status-idle"
        )}
      >
        {message}
      </p>
    </Section>
  );
}

function containsCjk(text: string) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

function shouldSearch(keyword: string) {
  if (!keyword.trim()) return false;
  if (containsCjk(keyword)) return keyword.trim().length >= 1;
  return keyword.trim().length >= 2;
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return "";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
