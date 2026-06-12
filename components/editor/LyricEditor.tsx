"use client";

import { motion } from "framer-motion";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { LyricsFetchPanel } from "@/components/editor/LyricsFetchPanel";
import { LyricInput } from "@/components/editor/LyricInput";
import { SongInfoForm } from "@/components/editor/SongInfoForm";
import { SongLinkParser } from "@/components/editor/SongLinkParser";
import { StylePanel } from "@/components/editor/StylePanel";
import { DynamicAppBackground } from "@/components/layout/DynamicAppBackground";
import { LyricCardPreview } from "@/components/preview/LyricCardPreview";
import { estimateCardHeight, PRESET_CARD_SIZES } from "@/lib/card-size";
import { TEXT_COLOR_PRESETS } from "@/lib/color-analysis";
import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { createT, messages } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import { extractPaletteFromImage } from "@/lib/palette-extraction";
import { DEFAULT_PALETTE, resolveAutoTextColor } from "@/lib/palette-background";
import type { AppState, CardRatio, CardStyle, Locale } from "@/lib/types";

const DEFAULT_SONG_URL = "https://music.apple.com/cn/song/opposite/1677892095";
const DEFAULT_LYRICS = [
  "And I know now",
  "Even if I tried to change",
  "That somehow",
  "You'd end up with her anyway"
].join("\n");
const DEFAULT_TRANSLATION = [
  "我如今才明白",
  "纵使我拼尽全力改写结局",
  "命运兜兜转转",
  "你终究还是会走向她"
].join("\n");

const defaultState: AppState = {
  locale: "zh",
  url: DEFAULT_SONG_URL,
  song: {
    source: "apple",
    title: "opposite",
    artist: "Sabrina Carpenter",
    album: "",
    originalCoverUrl: "",
    coverUrl: "",
    proxiedCoverUrl: "",
    originalUrl: DEFAULT_SONG_URL
  },
  lyrics: DEFAULT_LYRICS,
  translationText: DEFAULT_TRANSLATION,
  translationEnabled: true,
  style: {
    backgroundMode: "palette",
    extractedPalette: DEFAULT_PALETTE,
    layoutMode: "portrait",
    ratio: "custom",
    width: 1040,
    height: 1080,
    autoHeight: false,
    font: "sans-heavy",
    lyricFontSize: 60,
    lineHeight: 1.4,
    align: "left",
    textColorMode: "auto",
    textColorPreset: "white",
    customTextColor: "#FFFFFF",
    resolvedTextColor: "#FFFFFF",
    translationEnabled: true,
    translationText: DEFAULT_TRANSLATION,
    translationScale: 0.75,
    allowTwoLineTitle: false,
    contentMode: "lyrics",
    instrumentalText: "纯音乐",
    showCover: true,
    showSongInfo: false,
    showGeneratedWatermark: false,
    showSharedBy: false,
    sharedByText: "",
    showWatermark: false,
    showPlatformBadge: false,
    frameStyleEnabled: false,
    frameVariant: "fullBleed",
    showFrame: false,
    showShadow: false,
    coverCropScale: 1,
    watermark: messages.zh.madeWith
  },
  lastPortraitSize: {
    ratio: "custom",
    width: 1040,
    height: 1080
  },
  lastLandscapeSize: {
    ratio: "16:9",
    width: PRESET_CARD_SIZES["16:9"].width,
    height: PRESET_CARD_SIZES["16:9"].height
  },
  palette: DEFAULT_PALETTE,
  paletteWarning: ""
};

export function LyricEditor() {
  const [state, setState] = useState<AppState>(defaultState);
  const cardRef = useRef<HTMLElement | null>(null);
  const t = useMemo(() => createT(state.locale), [state.locale]);

  const parsedState = useMemo(
    () => ({
      ...state,
      style: {
        ...state.style,
        extractedPalette: state.palette ?? DEFAULT_PALETTE
      }
    }),
    [state]
  );
  const coverForPalette = state.song.proxiedCoverUrl || proxiedImageUrl(state.song.coverUrl);
  const canFetchLyrics = Boolean(state.song.originalUrl && state.song.title.trim());

  function clearAllContent() {
    setState((current) => ({
      ...current,
      url: "",
      song: {
        source: "unknown",
        title: "",
        artist: "",
        album: "",
        originalCoverUrl: "",
        coverUrl: "",
        proxiedCoverUrl: "",
        originalUrl: ""
      },
      lyrics: "",
      translationText: "",
      translationEnabled: false,
      palette: DEFAULT_PALETTE,
      paletteWarning: "",
      style: {
        ...current.style,
        extractedPalette: DEFAULT_PALETTE,
        translationEnabled: false,
        translationText: ""
      }
    }));
  }

  function handleStyleChange(nextStyle: CardStyle) {
    setState((current) => {
      const currentMode = current.style.layoutMode ?? "portrait";
      const nextMode = nextStyle.layoutMode ?? "portrait";

      if (currentMode !== nextMode) {
        if (nextMode === "landscape") {
          const restored = current.lastLandscapeSize ?? {
            ratio: "16:9" as CardRatio,
            width: PRESET_CARD_SIZES["16:9"].width,
            height: PRESET_CARD_SIZES["16:9"].height
          };

          return {
            ...current,
            lastPortraitSize: sizeSnapshot(current.style),
            style: {
              ...nextStyle,
              layoutMode: "landscape",
              ratio: restored.ratio,
              width: restored.width,
              height: restored.height,
              autoHeight: false
            }
          };
        }

        const restored = current.lastPortraitSize ?? {
          ratio: "4:5" as CardRatio,
          width: PRESET_CARD_SIZES["4:5"].width,
          height: PRESET_CARD_SIZES["4:5"].height
        };

        return {
          ...current,
          lastLandscapeSize: sizeSnapshot(current.style),
          style: {
            ...nextStyle,
            layoutMode: "portrait",
            ratio: restored.ratio,
            width: restored.width,
            height: restored.height,
            autoHeight: current.lastPortraitSize?.ratio === "custom" ? current.style.autoHeight : false
          }
        };
      }

      return {
        ...current,
        style: nextStyle,
        lastPortraitSize: nextMode === "portrait" ? sizeSnapshot(nextStyle) : current.lastPortraitSize,
        lastLandscapeSize: nextMode === "landscape" ? sizeSnapshot(nextStyle) : current.lastLandscapeSize
      };
    });
  }

  useEffect(() => {
    const storedLocale = window.localStorage.getItem("lyric-glass-card-locale");
    if (storedLocale === "zh" || storedLocale === "en") {
      setLocale(storedLocale);
    }
  }, []);

  function setLocale(locale: Locale) {
    setState((current) => {
      const previousDefaultInstrumentalTexts: string[] = ["纯音乐", "Instrumental Track"];
      const shouldUpdateInstrumentalText = previousDefaultInstrumentalTexts.includes(current.style.instrumentalText);

      return {
        ...current,
        locale,
        style: {
          ...current.style,
          instrumentalText: shouldUpdateInstrumentalText
            ? locale === "zh"
              ? "纯音乐"
              : "Instrumental Track"
            : current.style.instrumentalText
        }
      };
    });
    window.localStorage.setItem("lyric-glass-card-locale", locale);
  }

  useEffect(() => {
    const nextProxiedCoverUrl = proxiedImageUrl(state.song.coverUrl);
    if (nextProxiedCoverUrl === state.song.proxiedCoverUrl) {
      return;
    }

    setState((current) => ({
      ...current,
      song: {
        ...current.song,
        proxiedCoverUrl: nextProxiedCoverUrl
      }
    }));
  }, [state.song.coverUrl, state.song.proxiedCoverUrl]);

  useEffect(() => {
    let active = true;

    extractPaletteFromImage(coverForPalette).then((palette) => {
      if (!active) {
        return;
      }

      setState((current) => ({
        ...current,
        palette,
        paletteWarning: "",
        style: {
          ...current.style,
          extractedPalette: palette
        }
      }));
    });

    return () => {
      active = false;
    };
  }, [coverForPalette]);

  useEffect(() => {
    const style = state.style;
    const nextColor =
      style.textColorMode === "auto"
        ? resolveAutoTextColor()
        : style.textColorMode === "preset"
          ? TEXT_COLOR_PRESETS[style.textColorPreset].value
          : style.customTextColor;

    if (nextColor.toLowerCase() === style.resolvedTextColor.toLowerCase()) {
      return;
    }

    setState((current) => ({
      ...current,
      style: {
        ...current.style,
        resolvedTextColor: nextColor
      }
    }));
  }, [
    state.palette,
    state.style.customTextColor,
    state.style.resolvedTextColor,
    state.style.textColorMode,
    state.style.textColorPreset
  ]);

  useEffect(() => {
    if ((state.style.layoutMode ?? "portrait") === "landscape" || state.style.ratio !== "custom" || !state.style.autoHeight) {
      return;
    }

    const lines = state.lyrics.trim() ? state.lyrics.split(/\r?\n/).length : 1;
    const translationLines = state.style.translationEnabled && state.style.contentMode === "lyrics"
      ? state.style.translationText.split(/\r?\n/).filter(Boolean).length
      : 0;
    const nextHeight = estimateCardHeight({
      width: state.style.width,
      lyricLineCount: lines + translationLines,
      lyricCharacterCount: state.lyrics.length + (state.style.translationEnabled ? state.style.translationText.length : 0),
      lyricFontSize: state.style.lyricFontSize,
      lineHeight: state.style.lineHeight,
      showSongInfo: state.style.showSongInfo,
      showWatermark: state.style.showGeneratedWatermark,
      showPlatformBadge: state.style.showPlatformBadge,
      showSharedBy: state.style.showSharedBy && state.style.sharedByText.trim().length > 0
    });

    if (nextHeight === state.style.height) {
      return;
    }

    setState((current) => ({
      ...current,
      style: {
        ...current.style,
        height: nextHeight
      }
    }));
  }, [
    state.lyrics,
    state.style.autoHeight,
    state.style.height,
    state.style.layoutMode,
    state.style.lineHeight,
    state.style.lyricFontSize,
    state.style.ratio,
    state.style.contentMode,
    state.style.sharedByText,
    state.style.showGeneratedWatermark,
    state.style.showPlatformBadge,
    state.style.showSharedBy,
    state.style.showSongInfo,
    state.style.translationEnabled,
    state.style.translationText,
    state.style.width
  ]);

  return (
    <div className="app-shell min-h-screen" data-theme="dark">
      <DynamicAppBackground palette={state.palette} />
    <main className="relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-[calc(100vw-2rem)] max-w-[1520px] min-w-0 gap-5 sm:w-full">
        <header className="glass-panel min-w-0 max-w-full flex flex-col gap-4 rounded-lg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="app-text-primary text-2xl font-black tracking-normal sm:text-3xl">{t("appTitle")}</h1>
            <p className="app-text-subtle mt-1 text-sm">{t("appSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/Qrzzzz"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="app-button inline-flex h-10 w-10 items-center justify-center rounded-lg transition"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="h-5 w-5 fill-current">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </a>
            <button
              type="button"
              onClick={clearAllContent}
              className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
            >
              <Trash2 className="h-4 w-4" />
              {t("clearAll")}
            </button>
            <div className="inline-flex h-10 overflow-hidden rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] p-1">
              {(["zh", "en"] as Locale[]).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  onClick={() => setLocale(locale)}
                  className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                    state.locale === locale ? "bg-[rgb(var(--button-bg-hover))] app-text-primary" : "app-text-subtle hover:text-[rgb(var(--app-fg))]"
                  }`}
                >
                  {locale === "zh" ? t("chinese") : t("english")}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setState({
                  ...defaultState,
                  locale: state.locale,
                  style: {
                    ...defaultState.style,
                    instrumentalText: state.locale === "zh" ? "纯音乐" : "Instrumental Track",
                    watermark: messages[state.locale].madeWith
                  }
                })
              }
              className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
            >
              <RotateCcw className="h-4 w-4" />
              {t("reset")}
            </button>
          </div>
        </header>

        <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="order-2 grid min-w-0 gap-4 lg:order-1"
          >
            <SongLinkParser
              url={state.url}
              onUrlChange={(url) => setState((current) => ({ ...current, url }))}
              onParsed={(song) =>
                setState((current) => {
                  const originalCoverUrl = song.coverUrl ?? "";
                  const coverUrl = getHighResolutionCoverUrl(originalCoverUrl, song.source);

                  return {
                    ...current,
                    song: {
                      ...current.song,
                      ...song,
                      originalCoverUrl,
                      coverUrl,
                      proxiedCoverUrl: proxiedImageUrl(coverUrl)
                    }
                  };
                })
              }
              t={t}
              autoParseOnMount
            />
            <LyricsFetchPanel
              song={state.song}
              visible={canFetchLyrics}
              onUseLyrics={(lyrics) => setState((current) => ({ ...current, lyrics }))}
              t={t}
            />
            <SongInfoForm
              song={state.song}
              onSongChange={(song) => setState((current) => ({ ...current, song }))}
              t={t}
            />
            <LyricInput
              lyrics={state.lyrics}
              onLyricsChange={(lyrics) => setState((current) => ({ ...current, lyrics }))}
              translationEnabled={state.style.translationEnabled}
              translationText={state.style.translationText}
              onTranslationEnabledChange={(translationEnabled) =>
                setState((current) => ({
                  ...current,
                  translationEnabled,
                  style: { ...current.style, translationEnabled }
                }))
              }
              onTranslationTextChange={(translationText) =>
                setState((current) => ({
                  ...current,
                  translationText,
                  style: { ...current.style, translationText }
                }))
              }
              contentMode={state.style.contentMode}
              t={t}
            />
            <StylePanel
              style={state.style}
              onStyleChange={handleStyleChange}
              t={t}
            />
            <ExportPanel state={parsedState} cardRef={cardRef} t={t} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="order-1 min-w-0 lg:order-2"
          >
            <LyricCardPreview
              song={parsedState.song}
              lyrics={parsedState.lyrics}
              style={parsedState.style}
              cardRef={cardRef}
              locale={state.locale}
              t={t}
            />
          </motion.div>
        </div>
      </div>
    </main>
    </div>
  );
}

function sizeSnapshot(style: CardStyle) {
  return {
    ratio: style.ratio,
    width: style.width,
    height: style.height
  };
}
