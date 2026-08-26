import type {
  AISettingsSummary,
  AITranslationRequest,
  DesktopAIStreamEvent,
  SaveAISettingsInput
} from "@/lib/ai/types";
import type { EffectiveUiThemeId } from "@/lib/settings/types";
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

export type WindowMaterialResult = {
  ok: boolean;
  applied: "acrylic" | "none" | "transparent-fallback";
  reason: string;
};

export type DesktopWindowState = {
  maximized: boolean;
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
  loadAppPreferences: () => Promise<AppPreferencesRecord | null>;
  saveAppPreferences: (preferences: AppPreferencesRecord, options?: AppPreferencesSaveOptions) => Promise<boolean>;
  listSystemFonts: () => Promise<SystemFontOption[]>;
  pickFont: () => Promise<string | null>;
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

type LyricsCardDesktopBridge = Omit<LyricsCardDesktopApi, "createManualSave" | "updateManualSave"> & {
  createManualSaveEnvelope: (envelope: string) => Promise<ImportHistoryWriteResult>;
  updateManualSaveEnvelope: (recordId: string, envelope: string) => Promise<ImportHistoryWriteResult>;
};

const MAX_LEGACY_MANUAL_SAVE_ENVELOPE_CODE_UNITS = 512 * 1024 + 64;
const MAX_MANUAL_SAVE_ENVELOPE_CODE_UNITS = 2 * 1024 * 1024 + 64;

function isManualSaveEnvelope(value: unknown): value is ImportHistoryManualSaveEnvelope {
  if (typeof value !== "string" || !value.endsWith("}")) return false;
  if (value.startsWith('{"version":2,"snapshot":')) {
    return value.length <= MAX_MANUAL_SAVE_ENVELOPE_CODE_UNITS;
  }
  return value.startsWith('{"version":1,"snapshot":') &&
    value.length <= MAX_LEGACY_MANUAL_SAVE_ENVELOPE_CODE_UNITS;
}

function invalidManualSaveResult(): Promise<ImportHistoryWriteResult> {
  return Promise.resolve({ ok: false, code: "invalid_snapshot" });
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
