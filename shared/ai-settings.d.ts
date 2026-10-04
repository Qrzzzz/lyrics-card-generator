import type { AISettings, AIPromptLibrary } from "./ai-settings-types";
export const DEFAULT_AI_SETTINGS: AISettings;
export function normalizeAISettings(input: unknown): AISettings;
export function normalizePromptLibrary(input: unknown): AIPromptLibrary;
