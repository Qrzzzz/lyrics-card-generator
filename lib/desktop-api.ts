export type LyricsCardDesktopApi = {
  listSystemFonts: () => Promise<string[]>;
  pickFont: () => Promise<string | null>;
  openExternal: (url: string) => Promise<boolean>;
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
