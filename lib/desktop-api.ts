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
  ImportHistoryFileRegistration,
  ImportHistoryKind,
  ImportHistoryListResult,
  ImportHistoryManualSaveInput,
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
  createManualSave: (input: ImportHistoryManualSaveInput) => Promise<ImportHistoryWriteResult>;
  updateManualSave: (recordId: string, input: ImportHistoryManualSaveInput) => Promise<ImportHistoryWriteResult>;
  removeImportHistory: (recordId: string) => Promise<boolean>;
  clearImportHistory: () => Promise<number>;
  replayImportHistory: (recordId: string) => Promise<ImportHistoryReplayResult>;
  relocateImportHistory: (recordId: string) => Promise<ImportHistoryReplayResult>;
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
  }
}

export function getLyricsCardDesktopApi() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.lyricsCardDesktop;
}
