import type {
  AISettingsSummary,
  AITranslationRequest,
  DesktopAIStreamEvent,
  SaveAISettingsInput
} from "@/lib/ai/types";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";

export type SystemFontOption = {
  label: string;
  family: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
};

export type LyricsCardDesktopApi = {
  loadAppPreferences: () => Promise<{ locale: Locale; userSettings: UserSettings } | null>;
  saveAppPreferences: (preferences: { locale: Locale; userSettings: UserSettings }) => Promise<boolean>;
  listSystemFonts: () => Promise<SystemFontOption[]>;
  pickFont: () => Promise<string | null>;
  openExternal: (url: string) => Promise<boolean>;
  saveBackgroundImage: () => Promise<{ imageId: string; imageUrl: string } | null>;
  readBackgroundImage: (imageId: string) => Promise<string | undefined>;
  removeBackgroundImage: (imageId: string) => Promise<boolean>;
  loadAISettings: () => Promise<AISettingsSummary>;
  saveAISettings: (settings: SaveAISettingsInput) => Promise<AISettingsSummary>;
  clearAISettingsApiKey: () => Promise<AISettingsSummary>;
  startAITranslation: (requestId: string, request: AITranslationRequest) => Promise<string>;
  cancelAITranslation: (requestId: string) => void;
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
