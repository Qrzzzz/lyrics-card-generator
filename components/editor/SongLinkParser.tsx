"use client";

import { Link2, WandSparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input, Label, Section } from "@/components/ui/controls";
import { createAppRequestHeaders } from "@/lib/app-request";
import type { createT } from "@/lib/i18n";
import type { ParsedSongData } from "@/lib/types";
import type { DocumentImportIntent } from "@/lib/editor/document-transactions";
import type { LinkImportHistoryContext } from "@/lib/import-history";
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
  beginImport,
  onParsed,
  t,
  autoParseOnMount = false,
  autoParseVisitIntent = { id: 0, allowAutoParse: true }
}: {
  url: string;
  onUrlChange: (url: string) => void;
  beginImport: () => DocumentImportIntent | null;
  onParsed: (song: ParsedSongData, intent: DocumentImportIntent, context: LinkImportHistoryContext) => boolean;
  t: ReturnType<typeof createT>;
  autoParseOnMount?: boolean;
  autoParseVisitIntent?: Readonly<{ id: number; allowAutoParse: boolean }>;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const inputId = useId();
  const statusId = useId();
  const [message, setMessage] = useState<string>(t("parseIdle"));
  const handledAutoParseVisitRef = useRef<number | null>(null);
  const activeIntentRef = useRef<DocumentImportIntent | null>(null);

  useEffect(() => () => activeIntentRef.current?.cancel(), []);

  useEffect(() => {
    if (status === "idle") {
      setMessage(t("parseIdle"));
    }
  }, [status, t]);

  useEffect(() => {
    if (!autoParseOnMount || handledAutoParseVisitRef.current === autoParseVisitIntent.id) {
      return;
    }

    // Each visit ID carries an immutable decision captured synchronously by the
    // navigation event. URL edits alone must never trigger this effect.
    handledAutoParseVisitRef.current = autoParseVisitIntent.id;
    if (!autoParseVisitIntent.allowAutoParse || !url.trim()) return;
    void parseUrl();
  }, [autoParseOnMount, autoParseVisitIntent.id]);

  async function parseUrl() {
    if (!url.trim()) {
      setStatus("error");
      setMessage(t("parseNeedUrl"));
      return;
    }

    const intent = beginImport();
    if (!intent) return;
    activeIntentRef.current?.cancel();
    activeIntentRef.current = intent;
    setStatus("loading");
    setMessage(t("parseLoading"));

    try {
      const res = await fetch("/api/parse-song", {
        method: "POST",
        headers: createAppRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url }),
        signal: intent.signal
      });
      const payload = (await res.json()) as ParseResponse;

      if (!payload.ok) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[Lyric Card Generator] parse-song failed", {
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

      if (!onParsed(payload.data, intent, { inputUrl: url })) {
        intent.cancel();
        return;
      }
      setStatus("success");
      setMessage(t("parseSuccess", { source: payload.data.source }));
    } catch (error) {
      const wasAborted = intent.signal.aborted;
      intent.cancel();
      if (wasAborted) {
        setStatus("idle");
        setMessage(t("parseIdle"));
        return;
      }
      setStatus("error");
      if (process.env.NODE_ENV === "development" && error instanceof Error) {
        console.debug("[Lyric Card Generator] parse-song error", {
          input: url,
          error: error.message
        });
      }
      setMessage(t("parseError"));
    } finally {
      if (activeIntentRef.current?.id === intent.id) activeIntentRef.current = null;
    }
  }

  return (
    <Section title={t("songLink")} eyebrow={t("metadata")}>
      <Label label={t("musicUrl")} htmlFor={inputId}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="app-text-subtle pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              id={inputId}
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void parseUrl();
              }}
              aria-label={t("musicUrl")}
              aria-describedby={statusId}
              aria-busy={status === "loading"}
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
        id={statusId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          status === "success" && "status-success",
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
