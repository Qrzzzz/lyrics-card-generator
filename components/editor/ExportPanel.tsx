"use client";

import type { RefObject } from "react";
import { Download } from "lucide-react";
import { FieldLabel, Section, SegmentedControl } from "@/components/ui/controls";
import { StarBorder } from "@/components/ui/StarBorder";
import { getReadableForegroundColor } from "@/lib/contrast-color";
import type { ExportQualityId } from "@/lib/settings/types";
import type { createT } from "@/lib/i18n";

export function ExportPanel({
  cardRef,
  t,
  accentColor,
  exportQuality,
  onExportQualityChange,
  isExporting,
  onExport
}: {
  cardRef: RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
  accentColor: string;
  exportQuality: ExportQualityId;
  onExportQualityChange: (quality: ExportQualityId) => void;
  isExporting: boolean;
  onExport: () => void | Promise<void>;
}) {
  const foregroundColor = getReadableForegroundColor(accentColor);

  return (
    <Section title={t("export")} variant="plain" className="border-t-0 pt-0">
      <p className="app-text-subtle text-sm">{cardRef.current ? t("exportHint") : t("previewNotReady")}</p>
      <FieldLabel label={t("exportQuality")}>
        <SegmentedControl<ExportQualityId>
          value={exportQuality}
          onChange={onExportQualityChange}
          columns={3}
          options={[
            { value: "low", label: t("qualityLow") },
            { value: "medium", label: t("qualityMedium") },
            { value: "high", label: t("qualityHigh") }
          ]}
        />
      </FieldLabel>
      <div className="flex justify-end">
        <StarBorder
          type="button"
          data-testid="complete-export-button"
          color={accentColor}
          speed="7.2s"
          onClick={() => void onExport()}
          disabled={isExporting}
          className="complete-export-button transition hover:scale-[1.006] disabled:cursor-default disabled:opacity-70"
          style={{
            minHeight: 44,
            borderRadius: 8,
            color: foregroundColor,
            filter: `drop-shadow(0 12px 28px ${accentColor}44)`
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
