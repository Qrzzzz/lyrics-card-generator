"use client";

import { useRef, useState } from "react";
import { getCardSize } from "@/lib/card-size";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { clearLyricContent } from "@/lib/clear-content";
import { applyEditorStyleChange } from "@/lib/editor/apply-style-change";
import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { exportNodeAsPng } from "@/lib/export-image";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { ExampleLoadPayload } from "@/lib/examples";
import type {
  AppState,
  CardStyle,
  ParsedSongData,
  SongInfo
} from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";

type TranslationValue = {
  text: string;
  enabled: boolean;
};

type UseEditorActionsInput = {
  parsedState: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  cardRef: React.RefObject<HTMLElement | null>;
  exportPixelRatio: number;
  exampleLoadedMessage: string;
  onNotify: (message: string) => void;
  onCloseExamples: () => void;
  onClearTransientState: () => void;
};

export function useEditorActions({
  parsedState,
  setState,
  cardRef,
  exportPixelRatio,
  exampleLoadedMessage,
  onNotify,
  onCloseExamples,
  onClearTransientState
}: UseEditorActionsInput) {
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [isCompleteExporting, setIsCompleteExporting] = useState(false);
  const clearVersionRef = useRef(0);

  function setTranslation({ text, enabled }: TranslationValue) {
    setState((current) => ({
      ...current,
      translationText: text,
      translationEnabled: enabled,
      style: {
        ...current.style,
        translationText: text,
        translationEnabled: enabled
      }
    }));
  }

  function clearAllContent() {
    clearVersionRef.current += 1;
    setCelebrationKey(0);
    onClearTransientState();
    setState(clearLyricContent);
  }

  function handleStyleChange(nextStyle: CardStyle) {
    setState((current) => applyEditorStyleChange(current, nextStyle));
  }

  function setUrl(url: string) {
    setState((current) => ({ ...current, url }));
  }

  function applyParsedSong(song: ParsedSongData) {
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
    });
  }

  function applyLocalAudio(song: ParsedSongData, embeddedLyrics?: string) {
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
    });
  }

  function applySearchedSong(song: ParsedSongData, lyrics?: string) {
    setState((current) => {
      const { lyrics: _lyrics, ...songInfo } = song;
      const originalCoverUrl = song.coverUrl ?? "";
      const coverUrl = getHighResolutionCoverUrl(originalCoverUrl, song.source);

      return {
        ...current,
        url: song.originalUrl,
        song: {
          ...current.song,
          ...songInfo,
          originalCoverUrl,
          coverUrl,
          proxiedCoverUrl: coverUrl ? proxiedImageUrl(coverUrl) : ""
        },
        lyrics: lyrics?.trim() ? lyrics : current.lyrics
      };
    });
  }

  function setSong(song: SongInfo) {
    setState((current) => ({ ...current, song }));
  }

  function setLyrics(lyrics: string) {
    setState((current) => ({ ...current, lyrics }));
  }

  function setTranslationEnabled(translationEnabled: boolean) {
    setState((current) => ({
      ...current,
      translationEnabled,
      style: { ...current.style, translationEnabled }
    }));
  }

  function setTranslationText(translationText: string) {
    setState((current) => ({
      ...current,
      translationText,
      style: { ...current.style, translationText }
    }));
  }

  function splitAlternatingLyrics(lyrics: string, translationText: string) {
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
    }));
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
      await exportNodeAsPng(cardRef.current, fileName, size.width, size.height, exportPixelRatio);
      if (clearVersion === clearVersionRef.current) {
        setCelebrationKey((key) => key + 1);
      }
    } catch (error) {
      console.error("[Lyric Card Generator] complete export failed", error);
    } finally {
      setIsCompleteExporting(false);
    }
  }

  async function loadExample(payload: ExampleLoadPayload) {
    const { example, translation, importTranslation = true } = payload;
    clearVersionRef.current += 1;
    setState((current) => {
      const translationText = importTranslation ? translation.text : "";
      const translationEnabled = importTranslation && Boolean(translationText.trim()) && example.translationEnabled;

      return {
        ...current,
        url: example.url,
        song: {
          ...current.song,
          source: example.source,
          title: example.title,
          artist: example.artist,
          album: example.album,
          originalUrl: example.url
        },
        lyrics: example.lyrics,
        translationText,
        translationEnabled,
        style: {
          ...normalizeCardStyle(current.style),
          translationText,
          translationEnabled
        }
      };
    });
    onCloseExamples();
    onNotify(exampleLoadedMessage);

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
          song: {
            ...current.song,
            ...payload.data,
            originalCoverUrl,
            coverUrl,
            proxiedCoverUrl: proxiedImageUrl(coverUrl)
          }
        }));
      }
    } catch {
      // The example remains useful offline; cover/palette enrichment is best effort.
    }
  }

  return {
    celebrationKey,
    isCompleteExporting,
    clearAllContent,
    handleStyleChange,
    setTranslation,
    setUrl,
    applyParsedSong,
    applyLocalAudio,
    applySearchedSong,
    setSong,
    setLyrics,
    setTranslationEnabled,
    setTranslationText,
    splitAlternatingLyrics,
    loadExample,
    completeAndExport
  };
}
