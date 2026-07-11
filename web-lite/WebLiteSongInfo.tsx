"use client";

import { Download, ExternalLink, Upload } from "lucide-react";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActionButton,
  FieldLabel,
  Section,
  TextInput
} from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { SongInfo } from "@/lib/types";
import type { WebLiteCopy } from "@/web-lite/copy";
import { WEB_LITE_DESKTOP_URL } from "@/web-lite/links";

export function WebLiteSongInfo({
  song,
  t,
  copy,
  onSongChange,
  onLocalCover,
  onRemoteCover,
  onTransientStateChange,
  coverResetGeneration,
  validationGenerationRef
}: {
  song: SongInfo;
  t: ReturnType<typeof createT>;
  copy: WebLiteCopy;
  onSongChange: (song: SongInfo) => void;
  onLocalCover: (file: File) => void;
  onRemoteCover: (url: string, requestId: number) => boolean;
  onTransientStateChange: (hasTransientState: boolean) => void;
  coverResetGeneration: number;
  validationGenerationRef: MutableRefObject<number>;
}) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [remoteCoverInput, setRemoteCoverInput] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "success" | "danger">("info");
  const [isChecking, setIsChecking] = useState(false);
  const previousCoverResetGenerationRef = useRef(coverResetGeneration);
  const activeCover = song.proxiedCoverUrl || song.coverUrl || "";

  useEffect(() => {
    if (song.coverUrl && !song.coverUrl.startsWith("blob:")) {
      setRemoteCoverInput(song.coverUrl);
    }
  }, [song.coverUrl]);

  useEffect(() => {
    onTransientStateChange(Boolean(remoteCoverInput.trim() || status || isChecking));
  }, [isChecking, onTransientStateChange, remoteCoverInput, status]);

  useEffect(() => {
    if (previousCoverResetGenerationRef.current === coverResetGeneration) {
      return;
    }

    previousCoverResetGenerationRef.current = coverResetGeneration;
    validationGenerationRef.current += 1;
    setRemoteCoverInput("");
    setStatus("");
    setStatusTone("info");
    setIsChecking(false);
  }, [coverResetGeneration, validationGenerationRef]);

  useEffect(
    () => () => {
      validationGenerationRef.current += 1;
    },
    [validationGenerationRef]
  );

  function update<K extends keyof SongInfo>(key: K, value: SongInfo[K]) {
    onSongChange({ ...song, [key]: value });
  }

  function applyLocalCover(file?: File) {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    validationGenerationRef.current += 1;
    setRemoteCoverInput("");
    setStatus("");
    setStatusTone("info");
    setIsChecking(false);
    onLocalCover(file);
  }

  async function applyRemoteCover() {
    const candidate = remoteCoverInput.trim();
    const requestId = validationGenerationRef.current + 1;
    validationGenerationRef.current = requestId;
    let parsed: URL;

    try {
      parsed = new URL(candidate);
    } catch {
      setStatus(copy.remoteCoverHttpsOnly);
      setStatusTone("danger");
      return;
    }

    if (parsed.protocol !== "https:") {
      setStatus(copy.remoteCoverHttpsOnly);
      setStatusTone("danger");
      return;
    }

    setIsChecking(true);
    setStatus(copy.checkingRemoteCover);
    setStatusTone("info");

    try {
      await validateExportSafeImage(parsed.toString());
      if (validationGenerationRef.current !== requestId) {
        return;
      }
      if (!onRemoteCover(parsed.toString(), requestId)) {
        return;
      }
      setRemoteCoverInput(parsed.toString());
      setStatus(copy.remoteCoverReady);
      setStatusTone("success");
    } catch {
      if (validationGenerationRef.current !== requestId) {
        return;
      }
      setStatus(copy.remoteCoverFailed);
      setStatusTone("danger");
    } finally {
      if (validationGenerationRef.current === requestId) {
        setIsChecking(false);
      }
    }
  }

  return (
    <div className="grid gap-4">
      <Section title={t("songInfo")} eyebrow={t("manualOverride")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldLabel label={t("title")}>
            <TextInput value={song.title} onChange={(event) => update("title", event.target.value)} />
          </FieldLabel>
          <FieldLabel label={t("artist")}>
            <TextInput value={song.artist} onChange={(event) => update("artist", event.target.value)} />
          </FieldLabel>
        </div>

        <FieldLabel label={t("album")}>
          <TextInput value={song.album ?? ""} onChange={(event) => update("album", event.target.value)} />
        </FieldLabel>

        <FieldLabel label={copy.remoteCover} hint="HTTPS + CORS">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <TextInput
              data-testid="web-lite-remote-cover-input"
              type="url"
              inputMode="url"
              value={remoteCoverInput}
              onChange={(event) => {
                validationGenerationRef.current += 1;
                setRemoteCoverInput(event.target.value);
                setStatus("");
                setStatusTone("info");
                setIsChecking(false);
              }}
              placeholder={copy.remoteCoverPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void applyRemoteCover();
                }
              }}
            />
            <ActionButton
              data-testid="web-lite-apply-remote-cover"
              onClick={() => void applyRemoteCover()}
              disabled={isChecking || !remoteCoverInput.trim()}
            >
              {isChecking ? copy.checkingRemoteCover : copy.applyRemoteCover}
            </ActionButton>
          </div>
        </FieldLabel>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ActionButton icon={<Upload className="h-4 w-4" />} onClick={() => coverInputRef.current?.click()}>
            {copy.uploadCover}
          </ActionButton>
          <input
            ref={coverInputRef}
            data-testid="web-lite-local-cover-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              applyLocalCover(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[rgb(var(--panel-border))] bg-black/10">
              {activeCover ? (
                <img
                  data-testid="web-lite-active-cover"
                  src={activeCover}
                  alt=""
                  crossOrigin="anonymous"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
            </div>
            <p className="app-text-subtle min-w-0 text-sm">{copy.coverHint}</p>
          </div>
        </div>

        {status ? (
          <p
            data-testid="web-lite-cover-status"
            role="status"
            className={`rounded-lg border px-3 py-2 text-sm ${
              statusTone === "success"
                ? "status-success"
                : statusTone === "danger"
                  ? "status-danger"
                  : "status-info"
            }`}
          >
            {status}
          </p>
        ) : null}
      </Section>

      <aside className="status-info rounded-xl border p-4" aria-labelledby="web-lite-notice-title">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h3 id="web-lite-notice-title" className="font-bold">{copy.noticeTitle}</h3>
            <p className="mt-1 text-sm leading-relaxed opacity-85">{copy.noticeBody}</p>
            <a
              className="control-focus mt-3 inline-flex items-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-sm font-bold transition hover:bg-white/10"
              href={WEB_LITE_DESKTOP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.downloadDesktop}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}

function validateExportSafeImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      reject(new Error("Remote cover validation timed out."));
    }, 12000);

    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      window.clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Canvas is unavailable.");
        }
        context.drawImage(image, 0, 0, 1, 1);
        context.getImageData(0, 0, 1, 1);
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Remote cover could not be loaded with CORS enabled."));
    };
    image.src = src;
  });
}
