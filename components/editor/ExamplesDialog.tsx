"use client";

import { Music2, X } from "lucide-react";
import { useEffect } from "react";
import { ActionButton } from "@/components/ui/controls";
import {
  EXAMPLE_LANGUAGE_LABELS,
  EXAMPLE_SONGS,
  resolveExampleTranslation,
  type ExampleLoadPayload,
  type ExampleSong
} from "@/lib/examples";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function ExamplesDialog({ open, locale, onClose, onLoad }: { open: boolean; locale: Locale; onClose: () => void; onLoad: (payload: ExampleLoadPayload) => void }) {
  const copy = settingsCopy[locale];

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="examples-dialog-title"
        className="settings-surface glass-panel w-full max-w-6xl rounded-2xl p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="examples-dialog-title" className="flex items-center gap-2 text-xl font-bold">
            <Music2 className="h-5 w-5" />
            {copy.examples}
          </h2>
          <ActionButton
            variant="icon"
            size="sm"
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
            aria-label={copy.cancel}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EXAMPLE_SONGS.map((song) => (
            <ExampleSongCard key={song.id} song={song} locale={locale} onLoad={onLoad} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExampleSongCard({
  song,
  locale,
  onLoad
}: {
  song: ExampleSong;
  locale: Locale;
  onLoad: (payload: ExampleLoadPayload) => void;
}) {
  const copy = settingsCopy[locale];
  const defaultTranslation = resolveExampleTranslation(song, locale);
  const translationLabel =
    defaultTranslation.text.trim().length > 0 ? defaultTranslation.label : EXAMPLE_LANGUAGE_LABELS[locale];

  return (
    <div className="settings-panel-card grid min-h-[184px] content-between gap-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="truncate font-bold">{song.title}</div>
          <div className="app-text-subtle text-sm">{song.artist}</div>
          <div className="app-text-subtle mt-1 text-xs">
            {copy.originalLanguage}: {EXAMPLE_LANGUAGE_LABELS[song.originalLanguage]}
          </div>
        </div>
        <ActionButton
          size="sm"
          data-testid={`load-example-${song.id}`}
          onClick={() => onLoad({ example: song, translation: defaultTranslation })}
        >
          {copy.loadExample}
        </ActionButton>
      </div>

      <div className="rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] px-3 py-2">
        <div className="app-text-subtle text-xs font-medium">{copy.translationLanguage}</div>
        <div className="app-text-primary mt-1 truncate text-sm font-semibold">{translationLabel}</div>
      </div>
    </div>
  );
}
