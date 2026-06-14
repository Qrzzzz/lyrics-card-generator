"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { ExportCelebration } from "@/components/effects/ExportCelebration";
import { LyricsFetchPanel } from "@/components/editor/LyricsFetchPanel";
import { LyricInput } from "@/components/editor/LyricInput";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { SettingsStepper, type SettingsStep } from "@/components/editor/SettingsStepper";
import { SongInfoForm } from "@/components/editor/SongInfoForm";
import { SongLinkParser } from "@/components/editor/SongLinkParser";
import { LayoutSettingsPanel, VisualSettingsPanel } from "@/components/editor/StylePanel";
import {
  useAutoCanvasHeight,
  useCoverPalette,
  useResolvedTextColor,
  useSyncedCoverProxy
} from "@/components/editor/hooks/useLyricEditorEffects";
import { ClickSpark } from "@/components/layout/ClickSpark";
import { DynamicAppBackground } from "@/components/layout/DynamicAppBackground";
import { getCardSize, PRESET_CARD_SIZES } from "@/lib/card-size";
import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { exportNodeAsPng } from "@/lib/export-image";
import { createT, messages } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AppState, CardRatio, CardStyle, Locale } from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";

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
    autoHeight: true,
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
    showSongInfo: true,
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
  const [currentStep, setCurrentStep] = useState(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [isCompleteExporting, setIsCompleteExporting] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const clearVersionRef = useRef(0);
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

  useSyncedCoverProxy(state, setState);
  useCoverPalette(coverForPalette, setState);
  useResolvedTextColor(state, setState);
  useAutoCanvasHeight(state, setState);

  function clearAllContent() {
    clearVersionRef.current += 1;
    setCelebrationKey(0);
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

  async function completeAndExport() {
    if (!cardRef.current || isCompleteExporting) {
      return;
    }

    const clearVersion = clearVersionRef.current;
    setIsCompleteExporting(true);

    try {
      const size = getCardSize(parsedState.style);
      const fileName = `lyric-card-${sanitizeFilePart(parsedState.song.title)}.png`;
      await exportNodeAsPng(cardRef.current, fileName, size.width, size.height, 2);
      if (clearVersion === clearVersionRef.current) {
        setCelebrationKey((key) => key + 1);
      }
    } catch (error) {
      console.error("[Lyric Card Generator] complete export failed", error);
    } finally {
      setIsCompleteExporting(false);
    }
  }

  useEffect(() => {
    const storedLocale = window.localStorage.getItem("lyric-card-generator-locale");
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
    window.localStorage.setItem("lyric-card-generator-locale", locale);
  }

  const settingsSteps: SettingsStep[] = [
    {
      id: "link",
      title: t("step.songLink"),
      description: t("parseIdle"),
      isComplete: Boolean(state.url.trim()),
      content: (
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
      )
    },
    {
      id: "song",
      title: t("step.songInfo"),
      description: t("manualOverride"),
      isComplete: Boolean(state.song.title.trim() || state.song.artist.trim() || state.song.coverUrl?.trim()),
      content: (
        <SongInfoForm
          song={state.song}
          onSongChange={(song) => setState((current) => ({ ...current, song }))}
          t={t}
        />
      )
    },
    {
      id: "lyrics",
      title: t("step.lyrics"),
      description: t("manualText"),
      isComplete: state.style.contentMode === "instrumental" || Boolean(state.lyrics.trim()),
      content: (
        <div className="grid gap-4">
          <LyricsFetchPanel
            song={state.song}
            visible={canFetchLyrics}
            onUseLyrics={(lyrics) => setState((current) => ({ ...current, lyrics }))}
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
        </div>
      )
    },
    {
      id: "layout",
      title: t("step.layout"),
      description: t("layoutCompatibility"),
      isComplete: true,
      content: (
        <LayoutSettingsPanel
          style={state.style}
          onStyleChange={handleStyleChange}
          t={t}
        />
      )
    },
    {
      id: "visual",
      title: t("step.visual"),
      description: t("background"),
      isComplete: true,
      content: (
        <VisualSettingsPanel
          style={state.style}
          onStyleChange={handleStyleChange}
          t={t}
        />
      )
    },
    {
      id: "export",
      title: t("step.export"),
      description: t("exportHint"),
      isComplete: true,
      content: (
        <div className="glass-panel rounded-lg p-4">
          <p className="app-text-subtle text-sm">{t("exportHint")}</p>
        </div>
      )
    }
  ];

  return (
    <div className="app-shell min-h-screen" data-theme="dark">
      <DynamicAppBackground palette={state.palette} />
      <ClickSpark themeColor={state.palette?.primary ?? DEFAULT_PALETTE.primary}>
    <main className="relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-[calc(100vw-2rem)] max-w-[1520px] min-w-0 gap-5 sm:w-full">
        <EditorHeader locale={state.locale} t={t} onLocaleChange={setLocale} onClearAll={clearAllContent} />

        <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="order-2 grid min-w-0 gap-4 lg:order-1"
          >
            <SettingsStepper
              steps={settingsSteps}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              backText={t("step.back")}
              nextText={t("step.next")}
              completeText={t("step.complete")}
              completeDisabled={isCompleteExporting}
              onComplete={completeAndExport}
              themeColor={state.palette?.primary ?? DEFAULT_PALETTE.primary}
            />
          </motion.div>

          <PreviewPane
            isPreviewVisible={isPreviewVisible}
            onPreviewVisibleChange={setIsPreviewVisible}
            song={parsedState.song}
            lyrics={parsedState.lyrics}
            style={parsedState.style}
            cardRef={cardRef}
            locale={state.locale}
            t={t}
          />
        </div>
      </div>
    </main>
      </ClickSpark>
      <ExportCelebration burstKey={celebrationKey} accentColor={state.palette?.primary ?? DEFAULT_PALETTE.primary} />
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
