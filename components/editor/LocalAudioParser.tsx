"use client";

import { FileAudio, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Section } from "@/components/ui/controls";
import { createAppRequestHeaders } from "@/lib/app-request";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { getLocalizedAppApiError, type AppApiErrorCode } from "@/lib/app-api-errors";
import type { createT } from "@/lib/i18n";
import { isLocalAudioFileTooLarge } from "@/lib/local-audio-limits";
import type { ParsedSongData } from "@/lib/types";
import type { DocumentImportIntent } from "@/lib/editor/document-transactions";
import type { LocalAudioImportHistoryContext } from "@/lib/import-history";
import { cn } from "@/lib/utils";

type ParseLocalAudioResponse =
  | {
      ok: true;
      data: ParsedSongData;
      status: "success" | "no-lyrics";
      message: string;
    }
  | {
      ok: false;
      error: string;
      code?: AppApiErrorCode;
    };

export function LocalAudioParser({
  onParsed,
  beginImport,
  t
}: {
  beginImport: () => DocumentImportIntent | null;
  onParsed: (
    song: ParsedSongData,
    lyrics: string | undefined,
    intent: DocumentImportIntent,
    context: LocalAudioImportHistoryContext
  ) => boolean;
  t: ReturnType<typeof createT>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "partial" | "error">("idle");
  const [message, setMessage] = useState(t("localAudioIdle"));
  const activeIntentRef = useRef<DocumentImportIntent | null>(null);

  async function parseFile(file?: File) {
    if (!file) {
      return;
    }
    if (isLocalAudioFileTooLarge(file)) {
      setFileName(file.name);
      setStatus("error");
      setMessage(getLocalizedAppApiError("local_audio_too_large", t, ""));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const intent = beginImport();
    if (!intent) {
      // Selecting the same file does not fire another change event unless the
      // native input is reset, including when replacement confirmation is cancelled.
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    activeIntentRef.current?.cancel();
    activeIntentRef.current = intent;

    setFileName(file.name);
    setStatus("loading");
    setMessage(t("localAudioParsing"));
    let fileToken: string | undefined;
    const desktop = getLyricsCardDesktopApi();
    // File registration enriches replay history but must not block local parsing when unavailable.
    if (desktop) {
      try {
        fileToken = (await desktop.registerImportFile(file, "local-audio"))?.token;
      } catch {
        fileToken = undefined;
      }
    }

    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/parse-local-audio", {
        method: "POST",
        headers: createAppRequestHeaders(),
        body: formData,
        signal: intent.signal
      });
      const payload = (await response.json()) as ParseLocalAudioResponse;

      if (!payload.ok) {
        throw new Error(getLocalizedAppApiError(payload.code, t, payload.error));
      }

      if (!onParsed(payload.data, payload.data.lyrics, intent, { fileToken })) {
        intent.cancel();
        return;
      }
      setStatus(payload.status === "success" ? "success" : "partial");
      setMessage(payload.status === "success" ? t("localAudioSuccess") : t("localAudioNoLyrics"));
    } catch (error) {
      const wasAborted = intent.signal.aborted;
      intent.cancel();
      if (wasAborted) {
        setStatus("idle");
        setMessage(t("localAudioIdle"));
        return;
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("localAudioFailed"));
    } finally {
      if (activeIntentRef.current?.id === intent.id) activeIntentRef.current = null;
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  // Abort upload parsing when this import surface unmounts.
  useEffect(() => () => activeIntentRef.current?.cancel(), []);

  return (
    <Section title={t("localAudioTitle")} eyebrow={t("metadata")}>
      <p className="app-text-subtle text-sm">{t("localAudioDescription")}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "loading"}
          className="app-button inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-65"
        >
          <Upload className="h-4 w-4" />
          {status === "loading" ? t("localAudioParsing") : t("localAudioUpload")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.flac,audio/mpeg,audio/flac"
          className="hidden"
          onChange={(event) => void parseFile(event.target.files?.[0])}
        />
        {fileName ? (
          <div className="app-text-subtle flex min-w-0 items-center gap-2 text-sm">
            <FileAudio className="h-4 w-4 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
        ) : null}
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          status === "success" && "status-success",
          status === "partial" && "status-warning",
          status === "error" && "status-danger",
          status === "loading" && "status-info",
          status === "idle" && "status-idle"
        )}
      >
        {message}
      </p>
    </Section>
  );
}
