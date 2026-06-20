"use client";

import type { RefObject } from "react";
import { Download } from "lucide-react";
import { Section } from "@/components/ui/controls";
import { StarBorder } from "@/components/ui/StarBorder";
import { getReadableForegroundColor } from "@/lib/contrast-color";
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
  const themeColor = state.palette?.primary ?? state.style.extractedPalette?.primary ?? "#FFFFFF";
  const foregroundColor = getReadableForegroundColor(themeColor);

  return (
    <Section title={t("export")} eyebrow="PNG">
      <p className="app-text-subtle text-sm">{cardRef.current ? t("exportHint") : t("previewNotReady")}</p>
      <div className="flex justify-end">
        <StarBorder
          type="button"
          data-testid="complete-export-button"
          color={themeColor}
          speed="7.2s"
          onClick={() => void onExport()}
          disabled={isExporting}
          className="complete-export-button transition hover:scale-[1.006] disabled:cursor-default disabled:opacity-70"
          style={{
            minHeight: 44,
            borderRadius: 8,
            color: foregroundColor,
            filter: `drop-shadow(0 12px 28px ${themeColor}44)`
          }}
        >
          <span className="inline-flex h-11 items-center justify-center gap-2 px-8 text-lg font-black tracking-normal">
            <Download className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap">{t("step.complete")}</span>
          </span>
        </StarBorder>
      </div>
    </Section>
  );
}
