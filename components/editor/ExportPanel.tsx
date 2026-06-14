"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import type { RefObject } from "react";
import { getCardSize } from "@/components/preview/LyricCard";
import { Label, Section, Select } from "@/components/ui/controls";
import { exportNodeAsPng } from "@/lib/export-image";
import type { createT } from "@/lib/i18n";
import type { AppState } from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";

type ExportQuality = "high" | "medium" | "low";

const EXPORT_PIXEL_RATIO: Record<ExportQuality, number> = {
  high: 2,
  medium: 1.4,
  low: 1
};

export function ExportPanel({ state, cardRef, t }: { state: AppState; cardRef: RefObject<HTMLElement | null>; t: ReturnType<typeof createT> }) {
  const [status, setStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [quality, setQuality] = useState<ExportQuality>("high");

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
      await exportNodeAsPng(cardRef.current, fileName, size.width, size.height, EXPORT_PIXEL_RATIO[quality]);
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
      <Label label={t("exportQuality")}>
        <Select value={quality} onChange={(event) => setQuality(event.target.value as ExportQuality)}>
          <option value="high">{t("qualityHigh")}</option>
          <option value="medium">{t("qualityMedium")}</option>
          <option value="low">{t("qualityLow")}</option>
        </Select>
      </Label>
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
