"use client";

import { motion, type Transition } from "framer-motion";
import { ArrowRight, Music2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SurfaceCloseButton } from "@/components/layout/SurfaceCloseButton";
import { TitlebarGradualBlur } from "@/components/layout/TitlebarGradualBlur";
import { resolveReadableTextTokens } from "@/lib/color/contrast";
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
  onClose: () => void;
  transition: Transition;
};

type ExampleCardStyle = CSSProperties & {
  "--example-palette-1": string;
  "--example-palette-2": string;
  "--example-palette-3": string;
  "--example-card-scrim": string;
  "--app-text-primary": string;
  "--app-fg": string;
  "--app-muted": string;
  "--app-subtle": string;
  "--panel-border": string;
  "--control-focus-border": string;
  "--control-focus-ring": string;
};

export function ExamplesFloor({ isActive, locale, onLoad, onClose, transition }: ExamplesFloorProps) {
  const copy = settingsCopy[locale];
  const intro = getExamplesIntro(locale);
  const [importTranslation, setImportTranslation] = useState(true);
  const translationLanguageLabel = EXAMPLE_LANGUAGE_LABELS[locale];
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isActive]);

  return (
    <motion.section
      data-testid="examples-surface"
      data-surface-state={isActive ? "open" : "closed"}
      aria-hidden={!isActive}
      aria-labelledby="examples-floor-title"
      className={[
        "examples-floor absolute inset-0 z-20 flex min-w-0 flex-col overflow-hidden",
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
      <header className="settings-wing__header examples-wing__header relative z-20">
        <div className="settings-wing__identity min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="settings-wing__icon" aria-hidden="true">
              <Music2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 id="examples-floor-title" className="app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl">
                {copy.examples}
              </h1>
              <p className="app-text-subtle mt-1 hidden max-w-2xl truncate text-sm md:block">{intro}</p>
            </div>
          </div>
        </div>
        <div className="settings-wing__actions flex shrink-0 items-center gap-2 sm:gap-3">
          <SurfaceCloseButton
            buttonRef={closeButtonRef}
            label={copy.close}
            testId="examples-close-button"
            onClick={onClose}
          />
        </div>

        <div className="examples-wing__controls">
          <div className="examples-translation-control flex w-full min-w-0 items-center justify-between gap-3 self-start md:w-auto md:shrink-0 md:self-auto">
            <div id="examples-translation-language" className="min-w-0 flex-1 text-left leading-tight md:flex-none md:text-right">
              <span className="app-text-subtle block text-[10px] font-semibold uppercase tracking-[0.14em]">
                {copy.translationLanguage}
              </span>
              <span className={[
                "block truncate text-sm font-semibold transition-opacity",
                importTranslation ? "app-text-primary" : "app-text-subtle opacity-60"
              ].join(" ")}>
                {translationLanguageLabel}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={importTranslation}
              aria-describedby="examples-translation-language"
              className="examples-translation-switch control-focus inline-flex h-10 min-w-0 items-center gap-2 rounded-full border border-transparent px-2.5 text-xs font-semibold"
              onClick={() => setImportTranslation((current) => !current)}
            >
              <span className="truncate">{getImportTranslationLabel(locale)}</span>
              <span className="examples-toggle-track" aria-hidden="true">
                <span className="examples-toggle-knob" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="examples-floor__content-scroll relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1520px] px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
          <div className="examples-grid" data-count={Math.min(EXAMPLE_SONGS.length, 6)}>
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
      </div>

      <TitlebarGradualBlur
        edge="bottom"
        testId="examples-bottom-gradual-blur"
        className="examples-floor__bottom-blur"
      />
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
      return "Importar traducci\u00f3n";
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
      return "\u30b5\u30f3\u30d7\u30eb\u3092\u9078\u3076\u3068\u3001\u66f2\u60c5\u5831\u3001\u6b4c\u8a5e\u3001\u7ffb\u8a33\u3092\u3059\u3070\u3084\u304f\u5165\u529b\u3067\u304d\u307e\u3059\u3002";
    case "es":
      return "Elige un ejemplo para completar r\u00e1pidamente la canci\u00f3n, la letra y la traducci\u00f3n.";
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
  const originalLanguageLabel = song.originalLanguageLabel ?? EXAMPLE_LANGUAGE_LABELS[song.originalLanguage];

  return (
    <button
      type="button"
      data-testid={`load-example-${song.id}`}
      className="example-song-card control-focus group isolate flex min-w-0 flex-col overflow-hidden p-5 text-left"
      style={cardStyle}
      aria-label={`${copy.loadExample}: ${song.title} — ${song.artist} — ${song.album}`}
      onClick={() => onLoad({ example: song, translation: defaultTranslation, importTranslation })}
    >
      <span className="block min-w-0">
        <span className="app-text-primary line-clamp-2 text-sm font-semibold leading-5 opacity-80" title={song.album}>
          {song.album}
        </span>
      </span>

      <span className="mt-auto block min-w-0 pt-8">
        <span className="block min-w-0">
          <span role="heading" aria-level={3} className="app-text-primary block text-2xl font-black leading-tight tracking-tight">
            {song.title}
          </span>
          <span className="app-text-primary mt-2 block truncate text-sm font-medium opacity-70">{song.artist}</span>
        </span>

        <span className="app-text-primary mt-5 flex min-w-0 items-baseline justify-between gap-3 text-xs">
          <span className="shrink-0 font-medium opacity-55">{copy.originalLanguage}</span>
          <span className="truncate text-right font-semibold opacity-80">{originalLanguageLabel}</span>
        </span>

        <span className="example-song-card__cta app-text-primary -mx-5 -mb-5 mt-5 flex h-14 items-center justify-between px-5 text-sm">
          <span className="font-semibold">{copy.loadExample}</span>
          <ArrowRight className="example-song-card__cta-icon h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function getExampleCardStyle(song: ExampleSong): ExampleCardStyle {
  const [primary, secondary = primary, accent = secondary] = song.palette.colors;
  const textTokens = resolveReadableTextTokens(primary);
  const usesDarkText = textTokens.primary === "#191612";

  return {
    "--example-palette-1": primary,
    "--example-palette-2": secondary,
    "--example-palette-3": accent,
    "--example-card-scrim": usesDarkText ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.3)",
    "--app-text-primary": textTokens.primary,
    "--app-fg": textTokens.fg,
    "--app-muted": textTokens.muted,
    "--app-subtle": textTokens.subtle,
    "--panel-border": usesDarkText ? "25 22 18 / 0.16" : "255 255 255 / 0.2",
    "--control-focus-border": textTokens.primary,
    "--control-focus-ring": usesDarkText ? "rgba(25, 22, 18, 0.2)" : "rgba(255, 255, 255, 0.24)"
  };
}
