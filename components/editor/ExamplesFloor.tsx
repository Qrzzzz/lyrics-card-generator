"use client";

import { motion, type Transition } from "framer-motion";
import { Music2 } from "lucide-react";
import { useState } from "react";
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

type ExamplesFloorProps = {
  isActive: boolean;
  locale: Locale;
  onLoad: (payload: ExampleLoadPayload) => void;
  transition: Transition;
};

export function ExamplesFloor({ isActive, locale, onLoad, transition }: ExamplesFloorProps) {
  const copy = settingsCopy[locale];
  const intro = getExamplesIntro(locale);
  const [importTranslation, setImportTranslation] = useState(true);
  const translationLanguageLabel = EXAMPLE_LANGUAGE_LABELS[locale];

  return (
    <motion.section
      aria-hidden={!isActive}
      aria-labelledby="examples-floor-title"
      className={[
        "absolute inset-0 z-20 min-w-0 overflow-y-auto",
        isActive ? "pointer-events-auto" : "pointer-events-none"
      ].join(" ")}
      animate={{
        y: isActive ? "0%" : "-100%",
        opacity: isActive ? 1 : 0
      }}
      initial={false}
      inert={!isActive ? true : undefined}
      transition={transition}
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(var(--app-header-height)+1.5rem)] pt-6 sm:px-6 sm:pt-8">
        <header className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="examples-floor-title" className="app-text-primary flex min-w-0 items-center gap-2 text-2xl font-black tracking-normal sm:text-3xl">
              <Music2 className="h-6 w-6 shrink-0" />
              <span className="truncate">{copy.examples}</span>
            </h2>
            <p className="app-text-subtle mt-2 max-w-2xl text-sm">
              {intro}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
            <div className="app-text-subtle min-w-0 text-right text-xs font-medium sm:max-w-56">
              {copy.translationLanguage}: <span className="app-text-primary">{translationLanguageLabel}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={importTranslation}
              className="app-button inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold"
              onClick={() => setImportTranslation((current) => !current)}
            >
              <span>{getImportTranslationLabel(locale)}</span>
              <span className="toggle-track" aria-hidden="true">
                <span className="toggle-knob" />
              </span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXAMPLE_SONGS.map((song) => (
            <ExampleSongCard
              key={song.id}
              song={song}
              locale={locale}
              importTranslation={importTranslation}
              onLoad={onLoad}
            />
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function getImportTranslationLabel(locale: Locale) {
  switch (locale) {
    case "zh":
      return "\u5bfc\u5165\u7ffb\u8bd1";
    case "zh-TW":
      return "\u532f\u5165\u8b6f\u6587";
    case "fr":
      return "Importer la traduction";
    case "ja":
      return "\u7ffb\u8a33\u3092\u8aad\u307f\u8fbc\u3080";
    case "es":
      return "Importar traducción";
    default:
      return "Import translation";
  }
}

function getExamplesIntro(locale: Locale) {
  switch (locale) {
    case "zh":
      return "\u9009\u62e9\u4e00\u4e2a\u793a\u4f8b\uff0c\u5feb\u901f\u586b\u5165\u6b4c\u66f2\u4fe1\u606f\u3001\u6b4c\u8bcd\u548c\u7ffb\u8bd1\u3002";
    case "zh-TW":
      return "\u9078\u64c7\u4e00\u500b\u7bc4\u4f8b\uff0c\u5feb\u901f\u586b\u5165\u6b4c\u66f2\u8cc7\u8a0a\u3001\u6b4c\u8a5e\u548c\u8b6f\u6587\u3002";
    case "fr":
      return "Choisissez un exemple pour remplir rapidement les informations, les paroles et la traduction.";
    case "ja":
      return "サンプルを選ぶと、曲情報、歌詞、翻訳をすばやく入力できます。";
    case "es":
      return "Elige un ejemplo para completar rápidamente la canción, la letra y la traducción.";
    default:
      return "Choose an example to quickly fill in song details, lyrics, and translation.";
  }
}

function ExampleSongCard({
  song,
  locale,
  importTranslation,
  onLoad
}: {
  song: ExampleSong;
  locale: Locale;
  importTranslation: boolean;
  onLoad: (payload: ExampleLoadPayload) => void;
}) {
  const copy = settingsCopy[locale];
  const defaultTranslation = resolveExampleTranslation(song, locale);
  const cardStyle = getExampleCardStyle(song);

  return (
    <div className="settings-panel-card relative isolate flex h-[124px] min-w-0 items-center overflow-hidden p-4" style={cardStyle}>
      <div className="absolute inset-0 bg-black/22" aria-hidden="true" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.13),rgba(255,255,255,0.04)_34%,rgba(0,0,0,0.22))]" aria-hidden="true" />
      <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="app-text-primary truncate text-sm font-bold sm:text-base">{song.title}</div>
          <div className="app-text-subtle mt-0.5 truncate text-xs sm:text-sm">{song.artist}</div>
          <div className="mt-2 inline-flex max-w-full items-center rounded-md border border-white/14 bg-black/20 px-2 py-1 text-[11px] font-semibold text-white/78 backdrop-blur">
            <span className="truncate">{copy.originalLanguage}: {EXAMPLE_LANGUAGE_LABELS[song.originalLanguage]}</span>
          </div>
        </div>
        <ActionButton
          size="sm"
          data-testid={`load-example-${song.id}`}
          className="shrink-0"
          onClick={() => onLoad({ example: song, translation: defaultTranslation, importTranslation })}
        >
          {copy.loadExample}
        </ActionButton>
      </div>
    </div>
  );
}

function getExampleCardStyle(song: ExampleSong) {
  const [primary, secondary, accent = secondary] = song.preview.colors;

  return {
    background:
      `radial-gradient(circle at 16% 18%, ${accent} 0, transparent 34%), ` +
      `radial-gradient(circle at 82% 26%, ${secondary} 0, transparent 38%), ` +
      `linear-gradient(135deg, ${primary}, ${secondary} 56%, ${accent})`
  };
}
