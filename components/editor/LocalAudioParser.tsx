"use client";

import { FileAudio, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { ParsedSongData } from "@/lib/types";
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
    };

export function LocalAudioParser({
  onParsed,
  t
}: {
  onParsed: (song: ParsedSongData, lyrics?: string) => void;
  t: ReturnType<typeof createT>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "partial" | "error">("idle");
  const [message, setMessage] = useState(t("localAudioIdle"));

  async function parseFile(file?: File) {
    if (!file) {
      return;
    }

    setFileName(file.name);
    setStatus("loading");
    setMessage(t("localAudioParsing"));

    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/parse-local-audio", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as ParseLocalAudioResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      onParsed(payload.data, payload.data.lyrics);
      setStatus(payload.status === "success" ? "success" : "partial");
      setMessage(payload.status === "success" ? t("localAudioSuccess") : t("localAudioNoLyrics"));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("localAudioFailed"));
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

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
        className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          status === "success" && "border-emerald-200/22 bg-emerald-300/10 text-emerald-100/82",
          status === "partial" && "border-amber-200/22 bg-amber-300/10 text-amber-100/84",
          status === "error" && "border-rose-200/22 bg-rose-300/10 text-rose-100/86",
          status === "loading" && "border-cyan-200/22 bg-cyan-300/10 text-cyan-100/82",
          status === "idle" && "border-white/10 bg-white/[0.045] text-white/52"
        )}
      >
        {message}
      </p>
    </Section>
  );
}
