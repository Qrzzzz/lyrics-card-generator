"use client";

import { Music2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/controls";
import {
  EXAMPLE_LANGUAGE_LABELS,
  EXAMPLE_SONGS,
  resolveExampleTranslation,
  type ExampleLoadPayload,
  type ExampleSong,
  type ExampleTranslationLanguage
} from "@/lib/examples";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

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
        className="settings-surface glass-panel w-full max-w-lg rounded-2xl p-5"
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
        <div className="grid gap-3">
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
  const [selectedLanguage, setSelectedLanguage] = useState<ExampleTranslationLanguage>(defaultTranslation.language);
  const selectedTranslation =
    song.translations.find((translation) => translation.language === selectedLanguage) ?? defaultTranslation;

  useEffect(() => {
    setSelectedLanguage(defaultTranslation.language);
  }, [defaultTranslation.language, song.id]);

  return (
    <div className="settings-panel-card grid gap-4 p-4">
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
          onClick={() => onLoad({ example: song, translation: selectedTranslation })}
        >
          {copy.loadExample}
        </ActionButton>
      </div>

      <div>
        <div className="app-text-subtle mb-2 text-xs font-medium">{copy.translationLanguage}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={copy.translationLanguage}>
          {song.translations.map((translation) => {
            const selected = translation.language === selectedTranslation.language;
            return (
              <button
                key={translation.language}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  "control-focus h-9 rounded-lg border px-2 text-xs font-semibold transition",
                  selected
                    ? "control-variant-primary"
                    : "control-surface hover:bg-[rgb(var(--button-bg-hover))]"
                )}
                onClick={() => setSelectedLanguage(translation.language)}
              >
                <span className="block truncate">{translation.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
