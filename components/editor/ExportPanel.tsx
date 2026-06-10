"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { getCardSize } from "@/components/preview/LyricCard";
import { Section } from "@/components/ui/controls";
import { exportNodeAsPng } from "@/lib/export-image";
import type { createT } from "@/lib/i18n";
import type { AppState } from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";

export function ExportPanel({
  state,
  cardRef,
  t
}: {
  state: AppState;
  cardRef: React.RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
}) {
  const [status, setStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  async function exportPng() {
    if (!cardRef.current) {
      setStatus(t("previewNotReady"));
      return;
    }

    setIsExporting(true);
    setStatus(t("preparingPng"));

    try {
      const size = getCardSize(state.style);
      const fileName = `lyric-card-${sanitizeFilePart(state.song.title)}.png`;
      await exportNodeAsPng(cardRef.current, fileName, size.width, size.height);
      setStatus(t("pngExported"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown export error.";
      setStatus(t("exportFailed", { detail }));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Section title={t("export")} eyebrow="PNG">
      <button
        type="button"
        onClick={exportPng}
        disabled={isExporting}
        className="app-button inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold shadow-[0_16px_44px_rgba(44,201,222,0.18)] transition disabled:cursor-wait disabled:opacity-65"
      >
        <Download className="h-4 w-4" />
        {t("exportPng")}
      </button>
      <p className="app-text-subtle text-sm">{status || t("exportHint")}</p>
    </Section>
  );
}
