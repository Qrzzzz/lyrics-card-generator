import type {
  AISettingsSummary,
  AITranslationRequest,
  DesktopAIStreamEvent,
  SaveAISettingsInput
} from "@/lib/ai/types";
import type { EffectiveUiThemeId } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { AppPreferencesRecord } from "@/lib/settings/app-preferences-reconciliation";
import type {
  ImportHistoryFileKind,
  ImportHistoryFileChunkResult,
  ImportHistoryFileRegistration,
  ImportHistoryKind,
  ImportHistoryListResult,
  ImportHistoryManualSaveEnvelope,
  ImportHistoryReplayCommitResult,
  ImportHistoryReplayResult,
  ImportHistoryStats,
  ImportHistoryTrimConfirmation,
  ImportHistoryWriteCandidate,
  ImportHistoryWriteResult
} from "@/lib/import-history";

export type AppPreferencesSaveOptions = {
  importHistoryTrimConfirmation?: ImportHistoryTrimConfirmation;
};

export type SystemFontOption = {
  label: string;
  family: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
};

export type NativeFontPickerContext = {
  cjkFontFamily: string;
  latinFontFamily: string;
  locale: Locale;
  theme: EffectiveUiThemeId;
  title: string;
};

export type NativeFontPickerOptions = NativeFontPickerContext;

export type NativeFontPickerResult = Pick<
  NativeFontPickerContext,
  "cjkFontFamily" | "latinFontFamily"
>;

export type WindowMaterialResult = {
  ok: boolean;
  applied: "acrylic" | "none" | "transparent-fallback";
  reason: string;
};

export type DesktopWindowState = {
  maximized: boolean;
};

export type NativeMessageBoxType = "info" | "warning" | "error" | "question";

type NativeDialogOptions = {
  type: NativeMessageBoxType;
  title: string;
  message: string;
  detail: string;
};

export type NativeConfirmDialogOptions = NativeDialogOptions & {
  confirmLabel: string;
  cancelLabel: string;
};

export type NativeAlertDialogOptions = NativeDialogOptions & {
  closeLabel: string;
};

export type LyricsCardDesktopApi = {
  setWindowMaterial: (theme: EffectiveUiThemeId) => Promise<WindowMaterialResult>;
  minimizeWindow: () => Promise<boolean>;
  toggleMaximizeWindow: () => Promise<DesktopWindowState>;
  closeWindow: () => Promise<boolean>;
  confirmWindowClose: () => Promise<boolean>;
  getWindowState: () => Promise<DesktopWindowState>;
  onWindowStateChanged: (callback: (state: DesktopWindowState) => void) => () => void;
  onWindowCloseRequested: (callback: () => void) => () => void;
  showNativeConfirm: (options: NativeConfirmDialogOptions) => Promise<boolean>;
  showNativeAlert: (options: NativeAlertDialogOptions) => Promise<boolean>;
  loadAppPreferences: () => Promise<AppPreferencesRecord | null>;
  saveAppPreferences: (preferences: AppPreferencesRecord, options?: AppPreferencesSaveOptions) => Promise<boolean>;
  listSystemFonts: () => Promise<SystemFontOption[]>;
  pickFont: () => Promise<string | null>;
  openNativeFontPicker: (options: NativeFontPickerOptions) => Promise<NativeFontPickerResult | null>;
  getNativeFontPickerContext: () => Promise<NativeFontPickerContext | null>;
  applyNativeFontPicker: (result: NativeFontPickerResult) => Promise<boolean>;
  closeNativeFontPicker: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  saveBackgroundImage: () => Promise<{ imageId: string; imageUrl: string } | null>;
  readBackgroundImage: (imageId: string) => Promise<string | undefined>;
  removeBackgroundImage: (imageId: string) => Promise<boolean>;
  registerImportFile: (file: File, kind: ImportHistoryFileKind) => Promise<ImportHistoryFileRegistration | null>;
  listImportHistory: (options: {
    offset: number;
    limit: number;
    query?: string;
    source?: ImportHistoryKind | "all";
  }) => Promise<ImportHistoryListResult>;
  getImportHistoryStats: () => Promise<ImportHistoryStats>;
  recordImportHistory: (record: ImportHistoryWriteCandidate) => Promise<ImportHistoryWriteResult>;
  createManualSave: (envelope: ImportHistoryManualSaveEnvelope) => Promise<ImportHistoryWriteResult>;
  updateManualSave: (recordId: string, envelope: ImportHistoryManualSaveEnvelope) => Promise<ImportHistoryWriteResult>;
  removeImportHistory: (recordId: string) => Promise<boolean>;
  clearImportHistory: () => Promise<number>;
  replayImportHistory: (recordId: string) => Promise<ImportHistoryReplayResult>;
  relocateImportHistory: (recordId: string) => Promise<ImportHistoryReplayResult>;
  readImportHistoryFileChunk: (streamToken: string) => Promise<ImportHistoryFileChunkResult>;
  releaseImportHistoryFile: (streamToken: string) => Promise<boolean>;
  commitImportHistoryReplay: (recordId: string, relocationToken?: string) => Promise<ImportHistoryReplayCommitResult>;
  loadAISettings: () => Promise<AISettingsSummary>;
  saveAISettings: (settings: SaveAISettingsInput) => Promise<AISettingsSummary>;
  clearAISettingsApiKey: () => Promise<AISettingsSummary>;
  startAITranslation: (requestId: string, request: AITranslationRequest) => Promise<string>;
  cancelAITranslation: (requestId: string) => Promise<{ cancelled: boolean; active: boolean }>;
  onAITranslationChunk: (callback: (event: DesktopAIStreamEvent) => void) => () => void;
};

declare global {
  interface Window {
    lyricsCardDesktop?: LyricsCardDesktopApi;
    lyricsCardDesktopBridge?: LyricsCardDesktopBridge;
  }
}

type LyricsCardDesktopBridge = Omit<
  LyricsCardDesktopApi,
  "createManualSave" | "updateManualSave" | "showNativeConfirm" | "showNativeAlert" | "openNativeFontPicker" | "applyNativeFontPicker"
> & {
  showNativeConfirmDialog: (
    type: NativeMessageBoxType,
    title: string,
    message: string,
    detail: string,
    confirmLabel: string,
    cancelLabel: string
  ) => Promise<boolean>;
  showNativeAlertDialog: (
    type: NativeMessageBoxType,
    title: string,
    message: string,
    detail: string,
    closeLabel: string
  ) => Promise<boolean>;
  openNativeFontPickerWindow: (
    cjkFontFamily: string,
    latinFontFamily: string,
    locale: Locale,
    theme: EffectiveUiThemeId,
    title: string
  ) => Promise<NativeFontPickerResult | null>;
  applyNativeFontPickerFamilies: (cjkFontFamily: string, latinFontFamily: string) => Promise<boolean>;
  createManualSaveEnvelope: (envelope: string) => Promise<ImportHistoryWriteResult>;
  updateManualSaveEnvelope: (recordId: string, envelope: string) => Promise<ImportHistoryWriteResult>;
};

const MAX_LEGACY_MANUAL_SAVE_ENVELOPE_CODE_UNITS = 512 * 1024 + 64;
const MAX_MANUAL_SAVE_ENVELOPE_CODE_UNITS = 2 * 1024 * 1024 + 64;

function isManualSaveEnvelope(value: unknown): value is ImportHistoryManualSaveEnvelope {
  if (typeof value === "string" && value.endsWith("}")) {
    if (value.startsWith('{"version":2,"snapshot":')) {
      return value.length <= MAX_MANUAL_SAVE_ENVELOPE_CODE_UNITS;
    }
    return value.startsWith('{"version":1,"snapshot":') &&
      value.length <= MAX_LEGACY_MANUAL_SAVE_ENVELOPE_CODE_UNITS;
  }
  return false;
}

function invalidManualSaveResult(): Promise<ImportHistoryWriteResult> {
  return Promise.resolve({ ok: false, code: "invalid_snapshot" });
}

const NATIVE_DIALOG_TYPES = new Set<NativeMessageBoxType>(["info", "warning", "error", "question"]);
const FONT_PICKER_THEMES = new Set<EffectiveUiThemeId>([
  "album-dynamic",
  "dark",
  "light",
  "dark-acrylic",
  "light-acrylic"
]);
const FONT_PICKER_LOCALES = new Set<Locale>(["zh", "zh-TW", "en", "fr", "ja", "es"]);

function isDialogText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

function isFontFamily(value: unknown): value is string {
  return typeof value === "string" && isDialogText(value, 256) && !/[\r\n\0]/u.test(value);
}

function isNativeDialogOptions(value: unknown): value is NativeDialogOptions {
  if (!value || typeof value !== "object") return false;
  const options = value as Partial<NativeDialogOptions>;
  return Boolean(
    options.type && NATIVE_DIALOG_TYPES.has(options.type) &&
    isDialogText(options.title, 160) &&
    isDialogText(options.message, 320) &&
    typeof options.detail === "string" && options.detail.length <= 2_048
  );
}

function isNativeFontPickerOptions(value: unknown): value is NativeFontPickerOptions {
  if (!value || typeof value !== "object") return false;
  const options = value as Partial<NativeFontPickerOptions>;
  return Boolean(
    isFontFamily(options.cjkFontFamily) &&
    isFontFamily(options.latinFontFamily) &&
    options.locale && FONT_PICKER_LOCALES.has(options.locale) &&
    options.theme && FONT_PICKER_THEMES.has(options.theme) &&
    isDialogText(options.title, 160) &&
    !/[\r\n\0]/u.test(options.title)
  );
}

function createDesktopApi(bridge: LyricsCardDesktopBridge): LyricsCardDesktopApi {
  // Wrap the preload bridge with renderer-side envelope validation, then freeze
  // the public facade so page code cannot replace privileged methods.
  const api = Object.create(bridge) as LyricsCardDesktopApi;
  Object.defineProperties(api, {
    createManualSave: {
      enumerable: true,
      value: (envelope: unknown) => (
        isManualSaveEnvelope(envelope)
          ? bridge.createManualSaveEnvelope(envelope)
          : invalidManualSaveResult()
      )
    },
    updateManualSave: {
      enumerable: true,
      value: (recordId: string, envelope: unknown) => (
        isManualSaveEnvelope(envelope)
          ? bridge.updateManualSaveEnvelope(recordId, envelope)
          : invalidManualSaveResult()
      )
    },
    showNativeConfirm: {
      enumerable: true,
      value: (options: unknown) => (
        isNativeDialogOptions(options) &&
        isDialogText((options as NativeConfirmDialogOptions).confirmLabel, 80) &&
        isDialogText((options as NativeConfirmDialogOptions).cancelLabel, 80)
          ? bridge.showNativeConfirmDialog(
              options.type,
              options.title,
              options.message,
              options.detail,
              (options as NativeConfirmDialogOptions).confirmLabel,
              (options as NativeConfirmDialogOptions).cancelLabel
            )
          : Promise.resolve(false)
      )
    },
    showNativeAlert: {
      enumerable: true,
      value: (options: unknown) => (
        isNativeDialogOptions(options) &&
        isDialogText((options as NativeAlertDialogOptions).closeLabel, 80)
          ? bridge.showNativeAlertDialog(
              options.type,
              options.title,
              options.message,
              options.detail,
              (options as NativeAlertDialogOptions).closeLabel
            )
          : Promise.resolve(false)
      )
    },
    openNativeFontPicker: {
      enumerable: true,
      value: (options: unknown) => (
        isNativeFontPickerOptions(options)
          ? bridge.openNativeFontPickerWindow(
              options.cjkFontFamily,
              options.latinFontFamily,
              options.locale,
              options.theme,
              options.title
            )
          : Promise.resolve(null)
      )
    },
    applyNativeFontPicker: {
      enumerable: true,
      value: (result: unknown) => {
        if (!result || typeof result !== "object") return Promise.resolve(false);
        const candidate = result as Partial<NativeFontPickerResult>;
        return isFontFamily(candidate.cjkFontFamily) && isFontFamily(candidate.latinFontFamily)
          ? bridge.applyNativeFontPickerFamilies(candidate.cjkFontFamily.trim(), candidate.latinFontFamily.trim())
          : Promise.resolve(false);
      }
    }
  });
  return Object.freeze(api);
}

export function getLyricsCardDesktopApi() {
  if (typeof window === "undefined") {
    return undefined;
  }

  // Cache one immutable facade for stable method identity and listener cleanup.
  if (window.lyricsCardDesktop) return window.lyricsCardDesktop;
  if (!window.lyricsCardDesktopBridge) return undefined;
  const api = createDesktopApi(window.lyricsCardDesktopBridge);
  Object.defineProperty(window, "lyricsCardDesktop", {
    configurable: false,
    enumerable: true,
    value: api,
    writable: false
  });
  return api;
}
