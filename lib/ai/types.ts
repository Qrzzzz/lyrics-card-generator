import type { Locale } from "@/lib/types";

export type TranslationStyle =
  | "lyrical"
  | "faithful"
  | "spoken"
  | "imagistic"
  | "restrained"
  | "recommended";

export type EditableTranslationStyle = Exclude<TranslationStyle, "recommended">;

export type AIStylePresetOverride = {
  id: EditableTranslationStyle;
  title: string;
  prompt: string;
};

export type AICustomPreset = {
  id: string;
  title: string;
  prompt: string;
};

export type AILocalePromptOverrides = {
  formatRulesOverride: string;
  styleOverrides: AIStylePresetOverride[];
};

export type AIPromptLibrary = {
  localeOverrides: Partial<Record<Locale, AILocalePromptOverrides>>;
  hiddenStyleIds: EditableTranslationStyle[];
  customPresets: AICustomPreset[];
};

export type AISettings = {
  baseUrl: string;
  model: string;
  temperature: number;
  defaultStyle: string;
  reasoningEnabled: boolean;
  promptLibrary: AIPromptLibrary;
};

export type AISettingsSummary = AISettings & {
  hasApiKey: boolean;
};

export type SaveAISettingsInput = AISettings & {
  apiKey?: string;
};

export type AITranslationRequest = {
  prompt: string;
  reasoning: boolean;
};

export type AITranslationPhase = "idle" | "connecting" | "connected" | "reasoning" | "translating";

export type AITranslationStreamParams = AITranslationRequest & {
  signal?: AbortSignal;
  onDelta?: (delta: string, accumulated: string) => void;
  onReasoningDelta?: (delta: string, accumulated: string) => void;
  onStatus?: (phase: AITranslationPhase) => void;
};

export type DesktopAIStreamEvent = {
  requestId: string;
  kind: "content" | "reasoning" | "status";
  delta?: string;
  phase?: AITranslationPhase;
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  baseUrl: "https://api.openai.com/v1",
  model: "",
  temperature: 0.7,
  defaultStyle: "recommended",
  reasoningEnabled: false,
  promptLibrary: {
    localeOverrides: {},
    hiddenStyleIds: [],
    customPresets: []
  }
};
