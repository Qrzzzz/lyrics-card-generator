"use client";

import { Link2, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Input, Label, Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { ParsedSongData } from "@/lib/types";
import { cn } from "@/lib/utils";

type ParseResponse =
  | { ok: true; data: ParsedSongData }
  | {
      ok: false;
      error: string;
      details?: {
        input?: string;
        extractedUrl?: string;
        finalUrl?: string;
        detectedSource?: string;
        triedMethods?: string[];
        error?: string;
      };
    };

export function SongLinkParser({
  url,
  onUrlChange,
  onParsed,
  t
}: {
  url: string;
  onUrlChange: (url: string) => void;
  onParsed: (song: ParsedSongData) => void;
  t: ReturnType<typeof createT>;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>(t("parseIdle"));

  useEffect(() => {
    if (status === "idle") {
      setMessage(t("parseIdle"));
    }
  }, [status, t]);

  async function parseUrl() {
    if (!url.trim()) {
      setStatus("error");
      setMessage(t("parseNeedUrl"));
      return;
    }

    setStatus("loading");
    setMessage(t("parseLoading"));

    try {
      const res = await fetch("/api/parse-song", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = (await res.json()) as ParseResponse;

      if (!payload.ok) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[Lyric Glass Card] parse-song failed", {
            input: url,
            extractedUrl: payload.details?.extractedUrl,
            finalUrl: payload.details?.finalUrl,
            detectedSource: payload.details?.detectedSource,
            triedMethods: payload.details?.triedMethods,
            error: payload.details?.error || payload.error
          });
        }
        throw new Error(payload.error);
      }

      onParsed(payload.data);
      setStatus("success");
      setMessage(t("parseSuccess", { source: payload.data.source }));
    } catch (error) {
      setStatus("error");
      if (process.env.NODE_ENV === "development" && error instanceof Error) {
        console.debug("[Lyric Glass Card] parse-song error", {
          input: url,
          error: error.message
        });
      }
      setMessage(t("parseError"));
    }
  }

  return (
    <Section title={t("songLink")} eyebrow={t("metadata")}>
      <Label label={t("musicUrl")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="app-text-subtle pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="https://music.apple.com/..."
              className="pl-9"
            />
          </div>
          <button
            type="button"
            onClick={parseUrl}
            disabled={status === "loading"}
            className="app-button inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-65"
          >
            <WandSparkles className="h-4 w-4" />
            {status === "loading" ? t("parsing") : t("parse")}
          </button>
        </div>
      </Label>
      <p
        className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          status === "success" && "border-emerald-200/22 bg-emerald-300/10 text-emerald-100/82",
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
