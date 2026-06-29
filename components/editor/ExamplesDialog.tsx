"use client";

import { Music2, X } from "lucide-react";
import { useEffect } from "react";
import { EXAMPLE_SONGS, type ExampleSong } from "@/lib/examples";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function ExamplesDialog({ open, locale, onClose, onLoad }: { open: boolean; locale: Locale; onClose: () => void; onLoad: (song: ExampleSong) => void }) {
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
          <button
            type="button"
            onClick={onClose}
            className="app-button grid h-9 w-9 place-items-center rounded-lg"
            aria-label={copy.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {EXAMPLE_SONGS.map((song) => (
          <div key={song.id} className="settings-panel-card flex items-center justify-between gap-4 p-4">
            <div>
              <div className="font-bold">{song.title}</div>
              <div className="app-text-subtle text-sm">{song.artist}</div>
            </div>
            <button
              type="button"
              data-testid={`load-example-${song.id}`}
              onClick={() => onLoad(song)}
              className="app-button h-10 rounded-lg px-4 text-sm font-semibold"
            >
              {copy.loadExample}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
