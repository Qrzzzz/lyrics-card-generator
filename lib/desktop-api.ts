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
  ImportHistoryReplayResult,
  ImportHistoryWriteCandidate,
  ImportHistoryWriteResult
} from "@/lib/import-history";

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
  saveAppPreferences: (preferences: AppPreferencesRecord) => Promise<boolean>;
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
  getImportHistoryStats: () => Promise<{ total: number }>;
  recordImportHistory: (record: ImportHistoryWriteCandidate) => Promise<ImportHistoryWriteResult>;
  touchImportHistory: (recordId: string) => Promise<{ ok: boolean; code?: string }>;
  removeImportHistory: (recordId: string) => Promise<boolean>;
  clearImportHistory: () => Promise<number>;
  replayImportHistory: (recordId: string) => Promise<ImportHistoryReplayResult>;
  relocateImportHistory: (recordId: string) => Promise<ImportHistoryReplayResult>;
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
