export type RenderBoundaryName =
  | "LyricEditor"
  | "Stepper"
  | "AiPanel"
  | "ExportPanel"
  | "Examples"
  | "History"
  | "Settings"
  | "SettingsGeneral"
  | "SettingsAppearance"
  | "SettingsExport"
  | "SettingsAi"
  | "SettingsAbout";

declare global {
  interface Window {
    __LYRIC_CARD_RENDER_PROBE__?: (name: RenderBoundaryName) => void;
  }
}

export function recordRenderBoundary(name: RenderBoundaryName) {
  if (typeof window !== "undefined") {
    window.__LYRIC_CARD_RENDER_PROBE__?.(name);
  }
}
