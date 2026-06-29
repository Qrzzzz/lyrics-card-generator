"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { ExamplesDialog } from "@/components/editor/ExamplesDialog";
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
import {
  FontSchemeSettingsPanel,
  LayoutSettingsPanel,
  VisualSettingsPanel
} from "@/components/editor/StylePanel";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { FirstLaunchLanguageDialog } from "@/components/settings/FirstLaunchLanguageDialog";
import {
  useCoverPalette,
  useResolvedTextColor,
  useSyncedCoverProxy
} from "@/components/editor/hooks/useLyricEditorEffects";
import { useMeasuredAutoCanvasHeight } from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import { ClickSpark } from "@/components/layout/ClickSpark";
import { DesktopTitleBar } from "@/components/layout/DesktopTitleBar";
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
import { clearLyricContent } from "@/lib/clear-content";
import { exportNodeAsPng } from "@/lib/export-image";
import { DEFAULT_FONT_SCHEME } from "@/lib/font-schemes";
import { normalizeInstrumentalLayout } from "@/lib/card-style-normalize";
import { createT, messages } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import { loadBackgroundImage } from "@/lib/settings/background-storage";
import { isSupportedLocale, loadAppPreferences, saveAppPreferences, shouldShowFirstLaunchLanguage } from "@/lib/settings/app-preferences";
import { settingsCopy } from "@/lib/settings/copy";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/settings/types";
import { resolveEffectiveAppBackgroundColor, saveUserSettings } from "@/lib/settings/user-settings";
import { resolveReadableTextTokens } from "@/lib/color/contrast";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import type { ExampleSong } from "@/lib/examples";
import type { AppState, CardRatio, CardStyle, FontScheme, Locale } from "@/lib/types";
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
  style: {
    backgroundMode: "palette",
    extractedPalette: DEFAULT_PALETTE,
    layoutMode: "portrait",
    ratio: "custom",
    width: 1040,
    height: 1080,
    autoHeight: true,
    font: "sans-heavy",
    fontScheme: { ...DEFAULT_FONT_SCHEME },
    customFontEnabled: false,
    customFontFamily: "",
    customFontLabel: "",
    customFontWeight: 400,
    customFontStyle: "normal",
    lyricFontSize: 60,
    lineHeight: 1.4,
    align: "left",
    textColorMode: "auto",
    textColorPreset: "white",
    customTextColor: "#FFFFFF",
    resolvedTextColor: "#FFFFFF",
    translationEnabled: false,
    translationText: "",
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
    showFineGrid: false,
    fineGridDensity: "medium",
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
  const [fontSchemePreview, setFontSchemePreview] = useState<FontScheme | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [isCompleteExporting, setIsCompleteExporting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExamplesOpen, setIsExamplesOpen] = useState(false);
  const [isFirstLaunchOpen, setIsFirstLaunchOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>();
  const [isAITranslateOpen, setIsAITranslateOpen] = useState(false);
  const [isAITranslating, setIsAITranslating] = useState(false);
  const [aiStreamingText, setAIStreamingText] = useState("");
  const [aiReasoningText, setAIReasoningText] = useState("");
  const [aiTranslationPhase, setAITranslationPhase] = useState<AITranslationPhase>("idle");
  const [aiError, setAIError] = useState("");
  const [toast, setToast] = useState("");
  const [aiSettings, setAISettings] = useState<AISettingsSummary>({ ...DEFAULT_AI_SETTINGS, hasApiKey: false });
  const [isDesktopShell, setIsDesktopShell] = useState(false);
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

  function syncWindowMaterial(settings: UserSettings) {
    const desktop = getLyricsCardDesktopApi();
    if (desktop) {
      void desktop.setWindowMaterial(settings.uiTheme).catch(() => undefined);
    }
  }

  function clearAllContent() {
    clearVersionRef.current += 1;
    setCelebrationKey(0);
    setFontSchemePreview(null);
    setState(clearLyricContent);
  }

  function handleStyleChange(nextStyle: CardStyle) {
    setState((current) => {
      const normalizedNextStyle = normalizeInstrumentalLayout(nextStyle);
      const currentMode = current.style.layoutMode ?? "portrait";
      const nextMode = normalizedNextStyle.layoutMode ?? "portrait";

      if (normalizedNextStyle.contentMode === "instrumental") {
        return {
          ...current,
          lastLandscapeSize: currentMode === "landscape" ? sizeSnapshot(current.style) : current.lastLandscapeSize,
          lastPortraitSize: sizeSnapshot(normalizedNextStyle),
          style: normalizedNextStyle
        };
      }

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
              ...normalizedNextStyle,
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
            ...normalizedNextStyle,
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
        style: normalizedNextStyle,
        lastPortraitSize: nextMode === "portrait" ? sizeSnapshot(normalizedNextStyle) : current.lastPortraitSize,
        lastLandscapeSize: nextMode === "landscape" ? sizeSnapshot(normalizedNextStyle) : current.lastLandscapeSize
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
      await exportNodeAsPng(cardRef.current, fileName, size.width, size.height, userSettings.defaultExportPixelRatio);
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
    const desktopShell = Boolean(getLyricsCardDesktopApi());
    setIsDesktopShell(desktopShell);
    document.body.dataset.desktopShell = desktopShell ? "true" : "false";
    let active = true;
    void loadAppPreferences().then(({ locale: storedLocale, userSettings: loadedSettings }) => {
      if (!active) return;
      setUserSettings(loadedSettings);
      syncWindowMaterial(loadedSettings);
      if (isSupportedLocale(storedLocale)) {
        applyLocale(storedLocale);
      }
      setIsFirstLaunchOpen(shouldShowFirstLaunchLanguage(storedLocale, loadedSettings));
    });
    return () => {
      active = false;
      delete document.body.dataset.desktopShell;
    };
  }, []);

  useEffect(() => {
    document.body.dataset.uiTheme = userSettings.uiTheme;
    return () => {
      delete document.body.dataset.uiTheme;
    };
  }, [userSettings.uiTheme]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    loadBackgroundImage(userSettings.appBackground.imageId, userSettings.appBackground.imageUrl)
      .then((url) => {
        if (!active) {
          if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url?.startsWith("blob:") ? url : undefined;
        setBackgroundImageUrl(url);
      })
      .catch(() => { if (active) setBackgroundImageUrl(undefined); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userSettings.appBackground.imageId, userSettings.appBackground.imageUrl]);

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

  function applyLocale(locale: Locale) {
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
  }

  function setLocale(locale: Locale) {
    applyLocale(locale);
    void saveAppPreferences(locale, userSettings).catch(() => undefined);
  }

  function updateUserSettings(next: UserSettings) {
    const saved = saveUserSettings(next);
    setUserSettings(saved);
    syncWindowMaterial(saved);
    void saveAppPreferences(state.locale, saved).catch(() => undefined);
  }

  function previewUserSettings(next: UserSettings) {
    setUserSettings(next);
    syncWindowMaterial(next);
  }

  async function chooseFirstLaunchLanguage(locale: Locale) {
    const saved = saveUserSettings({ ...userSettings, firstLaunchLanguageSelected: true });
    applyLocale(locale);
    setUserSettings(saved);
    await saveAppPreferences(locale, saved).catch(() => undefined);
    setIsFirstLaunchOpen(false);
  }

  async function loadExample(example: ExampleSong) {
    clearVersionRef.current += 1;
    setState((current) => ({
      ...current,
      url: example.url,
      song: { ...current.song, source: example.source, title: example.title, artist: example.artist, originalUrl: example.url },
      lyrics: example.lyrics,
      translationText: example.translationText,
      translationEnabled: example.translationEnabled,
      style: { ...current.style, translationText: example.translationText, translationEnabled: example.translationEnabled }
    }));
    setIsExamplesOpen(false);
    setToast(settingsCopy[state.locale].exampleLoaded);
    try {
      const response = await fetch("/api/parse-song", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: example.url })
      });
      const payload = await response.json() as { ok: boolean; data?: AppState["song"] };
      if (payload.ok && payload.data) {
        const originalCoverUrl = payload.data.coverUrl ?? "";
        const coverUrl = getHighResolutionCoverUrl(originalCoverUrl, payload.data.source);
        setState((current) => ({
          ...current,
          song: { ...current.song, ...payload.data, originalCoverUrl, coverUrl, proxiedCoverUrl: proxiedImageUrl(coverUrl) }
        }));
      }
    } catch {
      // The example remains useful offline; cover/palette enrichment is best effort.
    }
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
      id: "font",
      title: t("step.fontScheme"),
      description: t("fontSchemeDescription"),
      isComplete: true,
      content: (
        <FontSchemeSettingsPanel
          style={state.style}
          onStyleChange={handleStyleChange}
          onFontSchemePreviewChange={setFontSchemePreview}
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

  const themeAccent = userSettings.uiTheme === "album-dynamic"
    ? state.palette?.primary ?? DEFAULT_PALETTE.primary
    : userSettings.uiTheme === "light-blue" ? "#2563EB"
    : userSettings.uiTheme === "dark-pink" ? "#EC4899"
    : userSettings.uiTheme === "light-acrylic" ? "#2563EB"
    : userSettings.uiTheme === "dark-acrylic" ? "#60A5FA"
    : userSettings.uiAccentColor;
  const uiBackgroundColor = resolveEffectiveAppBackgroundColor(userSettings, state.palette?.dark ?? "#080910");
  const effectiveTextColorMode = userSettings.uiTheme === "dark-acrylic" ? "light"
    : userSettings.uiTheme === "light-acrylic" ? "dark"
    : userSettings.uiTextColorMode;
  const preferredTextColor = effectiveTextColorMode === "light" ? "#FFFFFF"
    : effectiveTextColorMode === "dark" ? "#191612"
    : effectiveTextColorMode === "custom" ? userSettings.uiCustomTextColor : undefined;
  const uiTextTokens = resolveReadableTextTokens(uiBackgroundColor, preferredTextColor);
  const resolvedThemeTokens = userSettings.uiTheme === "dark-acrylic" || userSettings.uiTheme === "light-acrylic"
    ? {}
    : {
        "--app-text-primary": uiTextTokens.primary,
        "--app-fg": uiTextTokens.fg,
        "--app-muted": uiTextTokens.muted,
        "--app-subtle": uiTextTokens.subtle
      };
  const customThemeTokens = userSettings.uiTheme === "custom"
    ? uiTextTokens.fg === "25 22 18"
      ? {
          "--app-bg": uiBackgroundColor, "--panel-bg": "255 255 255 / 0.78", "--panel-border": "15 23 42 / 0.18",
          "--input-bg": "255 255 255 / 0.88", "--input-border": "15 23 42 / 0.2", "--button-bg": "255 255 255 / 0.72", "--button-bg-hover": "241 245 249 / 0.94"
        }
      : {
          "--app-bg": uiBackgroundColor, "--panel-bg": "5 8 14 / 0.68", "--panel-border": "255 255 255 / 0.16",
          "--input-bg": "5 8 14 / 0.72", "--input-border": "255 255 255 / 0.16", "--button-bg": "255 255 255 / 0.1", "--button-bg-hover": "255 255 255 / 0.16"
        }
    : {};

  return (
    <div
      className="app-shell min-h-screen"
      data-ui-theme={userSettings.uiTheme}
      data-desktop-shell={isDesktopShell ? "true" : "false"}
      style={{
        "--app-font-family": userSettings.uiFontFamily || undefined,
        "--app-accent": themeAccent,
        ...resolvedThemeTokens,
        ...customThemeTokens
      } as unknown as React.CSSProperties}
    >
      <DesktopTitleBar />
      <DynamicAppBackground palette={state.palette} settings={userSettings} imageUrl={backgroundImageUrl} />
      <ClickSpark enabled={userSettings.sparkCursorEnabled} themeColor={themeAccent}>
    <main className="app-main-content relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-[calc(100vw-2rem)] max-w-[1520px] min-w-0 gap-5 sm:w-full">
        <EditorHeader locale={state.locale} t={t} onOpenExamples={() => setIsExamplesOpen(true)} onClearAll={clearAllContent} onOpenSettings={() => setIsSettingsOpen(true)} />

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
            fontSchemePreview={fontSchemePreview}
            showFontSchemePreview={settingsSteps[currentStep]?.id === "font"}
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
        userSettings={userSettings}
        onLocaleChange={setLocale}
        onUserSettingsPreview={previewUserSettings}
        onUserSettingsChange={updateUserSettings}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(settings, message) => {
          setAISettings(settings);
          setToast(message || aiCopy.settingsSaved);
        }}
      />
      <ExamplesDialog open={isExamplesOpen} locale={state.locale} onClose={() => setIsExamplesOpen(false)} onLoad={loadExample} />
      <FirstLaunchLanguageDialog open={isFirstLaunchOpen} locale={state.locale} onChoose={chooseFirstLaunchLanguage} />
      {toast ? (
        <div role="status" className="status-info fixed bottom-5 left-1/2 z-[130] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
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


function normalizeAIErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "");
  }
  return "AI 翻译请求失败，请检查网络和接口设置。";
}
