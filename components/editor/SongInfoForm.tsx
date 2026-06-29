"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  ActionButton,
  FieldLabel,
  Section,
  TextInput,
  ToggleRow
} from "@/components/ui/controls";
import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import type { SongInfo } from "@/lib/types";

export function SongInfoForm({
  song,
  onSongChange,
  t
}: {
  song: SongInfo;
  onSongChange: (song: SongInfo) => void;
  t: ReturnType<typeof createT>;
}) {
  const [enabled, setEnabled] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof SongInfo>(key: K, value: SongInfo[K]) {
    onSongChange({ ...song, [key]: value });
  }

  function onUpload(file?: File) {
    if (!file) {
      return;
    }
    onSongChange({ ...song, originalCoverUrl: "", coverUrl: URL.createObjectURL(file), proxiedCoverUrl: "" });
  }

  function updateCoverUrl(url: string) {
    const coverUrl = getHighResolutionCoverUrl(url, song.source);
    onSongChange({ ...song, originalCoverUrl: url, coverUrl, proxiedCoverUrl: proxiedImageUrl(coverUrl) });
  }

  return (
    <Section title={t("songInfo")} eyebrow={t("manualOverride")}>
      <ToggleRow label={t("manualOverride")} checked={enabled} onChange={setEnabled} />
      {enabled ? (
        <>
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
          <FieldLabel label={t("coverUrl")}>
            <TextInput
              value={song.coverUrl?.startsWith("blob:") ? "" : song.coverUrl ?? ""}
              onChange={(event) => updateCoverUrl(event.target.value)}
              placeholder="https://..."
            />
          </FieldLabel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ActionButton
              icon={<Upload className="h-4 w-4" />}
              onClick={() => coverInputRef.current?.click()}
            >
              {t("uploadCover")}
            </ActionButton>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => onUpload(event.target.files?.[0])}
            />
            <div className="flex items-center gap-3">
              {song.coverUrl ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxiedImageUrl(song.coverUrl)}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div className="h-14 w-14 rounded-lg border border-white/14 bg-white/10" />
              )}
              <p className="app-text-subtle text-sm">{t("coverExportHint")}</p>
            </div>
          </div>
        </>
      ) : null}
    </Section>
  );
}
