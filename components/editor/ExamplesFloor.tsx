"use client";

import { motion, type Transition } from "framer-motion";
import { Music2 } from "lucide-react";
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

  return (
    <motion.section
      aria-hidden={!isActive}
      aria-labelledby="examples-floor-title"
      className={[
        "absolute inset-0 z-20 min-w-0 overflow-y-auto",
        "bg-[linear-gradient(145deg,rgba(15,23,42,0.32),rgba(30,41,59,0.16))] backdrop-blur-sm",
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
        <header className="mb-5 min-w-0">
          <h2 id="examples-floor-title" className="app-text-primary flex min-w-0 items-center gap-2 text-2xl font-black tracking-normal sm:text-3xl">
            <Music2 className="h-6 w-6 shrink-0" />
            <span className="truncate">{copy.examples}</span>
          </h2>
          <p className="app-text-subtle mt-2 max-w-2xl text-sm">
            {intro}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXAMPLE_SONGS.map((song) => (
            <ExampleSongCard key={song.id} song={song} locale={locale} onLoad={onLoad} />
          ))}
        </div>
      </div>
    </motion.section>
  );
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
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="app-text-primary truncate font-bold">{song.title}</div>
          <div className="app-text-subtle truncate text-sm">{song.artist}</div>
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
