"use client";

import type { RefObject } from "react";
import { Download } from "lucide-react";
import { Section } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { AppState } from "@/lib/types";

export function ExportPanel({
  state,
  cardRef,
  t,
  isExporting,
  onExport
}: {
  state: AppState;
  cardRef: RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
  isExporting: boolean;
  onExport: () => void | Promise<void>;
}) {
  return (
    <Section title={t("export")} eyebrow="PNG">
      <p className="app-text-subtle text-sm">{cardRef.current ? t("exportHint") : t("previewNotReady")}</p>
      <div className="rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-white/66">
        {t("completeExportHint")}
      </div>
      <button
        type="button"
        onClick={() => void onExport()}
        disabled={isExporting}
        className="app-button inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          borderColor: state.palette?.primary ?? state.style.extractedPalette?.primary ?? "rgba(255,255,255,0.22)",
          boxShadow: `0 14px 36px ${(state.palette?.primary ?? state.style.extractedPalette?.primary ?? "#ffffff")}28`
        }}
      >
        <Download className="h-4 w-4" />
        {t("exportPng")}
      </button>
    </Section>
  );
}
