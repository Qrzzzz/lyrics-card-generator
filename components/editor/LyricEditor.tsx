"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { ExportCelebration } from "@/components/effects/ExportCelebration";
import { LocalAudioParser } from "@/components/editor/LocalAudioParser";
import { LyricsFetchPanel } from "@/components/editor/LyricsFetchPanel";
import { LyricInput } from "@/components/editor/LyricInput";
import { AiTranslatePanel } from "@/components/lyrics/AiTranslatePanel";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { SettingsStepper, type SettingsStep } from "@/components/editor/SettingsStepper";
import { SongInfoForm } from "@/components/editor/SongInfoForm";
import { SongLinkParser } from "@/components/editor/SongLinkParser";
import { LayoutSettingsPanel, VisualSettingsPanel } from "@/components/editor/StylePanel";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import {
  useCoverPalette,
  useResolvedTextColor,
  useSyncedCoverProxy
} from "@/components/editor/hooks/useLyricEditorEffects";
import { useMeasuredAutoCanvasHeight } from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import { ClickSpark } from "@/components/layout/ClickSpark";
import { DynamicAppBackground } from "@/components/layout/DynamicAppBackground";
import { getCardSize, PRESET_CARD_SIZES } from "@/lib/card-size";
import { cleanAITranslation } from "@/lib/ai/clean";
import {
  AITranslationError,
  loadAISettings,
  streamAITranslation,
  validateConfiguredSettings
} from "@/lib/ai/client";
import { buildLyricsTranslationPrompt } from "@/lib/ai/prompt";
import {
  DEFAULT_AI_SETTINGS,
  type AITranslationPhase,
  type AISettingsSummary,
  type TranslationStyle
} from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
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
const SUPPORTED_LOCALES: Locale[] = ["zh", "zh-TW", "en", "fr", "ja", "es"];
const DEFAULT_INSTRUMENTAL_TEXT: Record<Locale, string> = {
  zh: "纯音乐",
  "zh-TW": "純音樂",
  en: "Instrumental Track",
  fr: "Morceau instrumental",
  ja: "インストゥルメンタル",
  es: "Pista instrumental"
};

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
    customFontEnabled: false,
    customFontFamily: "",
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAITranslateOpen, setIsAITranslateOpen] = useState(false);
  const [isAITranslating, setIsAITranslating] = useState(false);
  const [aiStreamingText, setAIStreamingText] = useState("");
  const [aiReasoningText, setAIReasoningText] = useState("");
  const [aiTranslationPhase, setAITranslationPhase] = useState<AITranslationPhase>("idle");
  const [aiError, setAIError] = useState("");
  const [toast, setToast] = useState("");
  const [aiSettings, setAISettings] = useState<AISettingsSummary>({ ...DEFAULT_AI_SETTINGS, hasApiKey: false });
  const cardRef = useRef<HTMLElement | null>(null);
  const clearVersionRef = useRef(0);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const t = useMemo(() => createT(state.locale), [state.locale]);
  const aiCopy = useMemo(() => getAIUiCopy(state.locale), [state.locale]);

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
  useMeasuredAutoCanvasHeight(state, setState, cardRef);

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
    if (isSupportedLocale(storedLocale)) {
      setLocale(storedLocale);
    }
  }, []);

  useEffect(() => {
    loadAISettings().then(setAISettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function updateTranslationText(translationText: string, enabled = true) {
    setState((current) => ({
      ...current,
      translationText,
      translationEnabled: enabled,
      style: { ...current.style, translationText, translationEnabled: enabled }
    }));
  }

  function openAITranslate() {
    if (isAITranslateOpen) {
      setIsAITranslateOpen(false);
      return;
    }

    if (!state.lyrics.trim()) {
      setToast(aiCopy.lyricsEmpty);
      return;
    }

    try {
      validateConfiguredSettings(aiSettings);
    } catch (error) {
      setToast(error instanceof Error ? error.message : aiCopy.configureFirst);
      setIsSettingsOpen(true);
      return;
    }

    setAIError("");
    setAIStreamingText("");
    setAIReasoningText("");
    setAITranslationPhase("idle");
    setIsAITranslateOpen(true);
  }

  async function translateWithAI(style: TranslationStyle, reasoning: boolean) {
    const previousTranslation = state.style.translationText;
    const previousEnabled = state.style.translationEnabled;
    if (previousTranslation.trim() && !window.confirm(aiCopy.overwriteConfirm)) {
      return;
    }

    const controller = new AbortController();
    aiAbortControllerRef.current = controller;
    setIsAITranslating(true);
    setAIError("");
    setAIStreamingText("");
    setAIReasoningText("");
    setAITranslationPhase("connecting");
    let wrotePartial = false;

    try {
      const prompt = buildLyricsTranslationPrompt({
        lyrics: state.lyrics,
        style,
        targetLocale: state.locale
      });
      const raw = await streamAITranslation({
        prompt,
        reasoning,
        signal: controller.signal,
        onStatus: setAITranslationPhase,
        onReasoningDelta: (_delta, accumulated) => setAIReasoningText(accumulated.slice(-12000)),
        onDelta: (_delta, accumulated) => {
          const cleaned = cleanAITranslation(accumulated);
          setAIStreamingText(cleaned || accumulated.trim());
          if (cleaned) {
            wrotePartial = true;
            updateTranslationText(cleaned);
          }
        }
      });
      const cleaned = cleanAITranslation(raw);
      if (!cleaned) {
        throw new AITranslationError(aiCopy.emptyResponse, "empty_response");
      }
      updateTranslationText(cleaned);
      setAISettings((current) => ({ ...current, defaultStyle: style, reasoningEnabled: reasoning }));
      setToast(aiCopy.translated);
    } catch (error) {
      if (wrotePartial) {
        updateTranslationText(previousTranslation, previousEnabled);
      }
      const aborted = controller.signal.aborted;
      setAIError(aborted ? aiCopy.cancelled : normalizeAIErrorMessage(error));
    } finally {
      aiAbortControllerRef.current = null;
      setIsAITranslating(false);
      setAITranslationPhase("idle");
    }
  }

  function cancelAITranslation() {
    aiAbortControllerRef.current?.abort();
  }

  function setLocale(locale: Locale) {
    setState((current) => {
      const previousDefaultInstrumentalTexts = Object.values(DEFAULT_INSTRUMENTAL_TEXT);
      const shouldUpdateInstrumentalText = previousDefaultInstrumentalTexts.includes(current.style.instrumentalText);

      return {
        ...current,
        locale,
        style: {
          ...current.style,
          instrumentalText: shouldUpdateInstrumentalText ? DEFAULT_INSTRUMENTAL_TEXT[locale] : current.style.instrumentalText
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
        <div className="grid gap-4">
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
          <LocalAudioParser
            t={t}
            onParsed={(song, embeddedLyrics) =>
              setState((current) => {
                const { lyrics: _lyrics, ...songInfo } = song;

                return {
                  ...current,
                  url: song.originalUrl,
                  song: {
                    ...current.song,
                    ...songInfo,
                    proxiedCoverUrl: song.coverUrl ? proxiedImageUrl(song.coverUrl) : ""
                  },
                  lyrics: embeddedLyrics ? embeddedLyrics : current.lyrics
                };
              })
            }
          />
        </div>
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
            onSplitAlternatingLyrics={(lyrics, translationText) =>
              setState((current) => ({
                ...current,
                lyrics,
                translationText,
                translationEnabled: true,
                style: {
                  ...current.style,
                  translationText,
                  translationEnabled: true
                }
              }))
            }
            onAITranslate={openAITranslate}
            isAITranslating={isAITranslating}
            aiTranslatePanel={isAITranslateOpen ? (
              <AiTranslatePanel
                locale={state.locale}
                initialStyle={aiSettings.defaultStyle}
                initialReasoning={aiSettings.reasoningEnabled}
                loading={isAITranslating}
                streamingText={aiStreamingText}
                reasoningText={aiReasoningText}
                phase={aiTranslationPhase}
                themeColor={state.palette?.primary ?? DEFAULT_PALETTE.primary}
                error={aiError}
                onClose={() => setIsAITranslateOpen(false)}
                onCancel={cancelAITranslation}
                onConfirm={translateWithAI}
              />
            ) : null}
            themeColor={state.palette?.primary ?? DEFAULT_PALETTE.primary}
            contentMode={state.style.contentMode}
            locale={state.locale}
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
        <ExportPanel
          state={parsedState}
          cardRef={cardRef}
          t={t}
          isExporting={isCompleteExporting}
          onExport={completeAndExport}
        />
      )
    }
  ];

  return (
    <div className="app-shell min-h-screen" data-theme="dark">
      <DynamicAppBackground palette={state.palette} />
      <ClickSpark themeColor={state.palette?.primary ?? DEFAULT_PALETTE.primary}>
    <main className="relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-[calc(100vw-2rem)] max-w-[1520px] min-w-0 gap-5 sm:w-full">
        <EditorHeader locale={state.locale} t={t} onOpenSettings={() => setIsSettingsOpen(true)} onClearAll={clearAllContent} />

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
      <SettingsDialog
        open={isSettingsOpen}
        locale={state.locale}
        onLocaleChange={setLocale}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(settings, message) => {
          setAISettings(settings);
          setToast(message || aiCopy.settingsSaved);
        }}
      />
      {toast ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-[130] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-white/15 bg-slate-950/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          {toast}
        </div>
      ) : null}
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

function isSupportedLocale(locale: string | null): locale is Locale {
  return Boolean(locale && SUPPORTED_LOCALES.includes(locale as Locale));
}

function normalizeAIErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "");
  }
  return "AI 翻译请求失败，请检查网络和接口设置。";
}
