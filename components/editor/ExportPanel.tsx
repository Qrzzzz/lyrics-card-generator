"use client";

import type { RefObject } from "react";
import { FieldLabel, Section, SegmentedControl } from "@/components/ui/controls";
import type { ExportQualityId } from "@/lib/settings/types";
import type { createT } from "@/lib/i18n";

export function ExportPanel({
  cardRef,
  t,
  exportQuality,
  onExportQualityChange,
  isExporting,
  qualityOptions = ["low", "medium", "high"],
  qualityLabels
}: {
  cardRef: RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
  accentColor: string;
  exportQuality: ExportQualityId;
  onExportQualityChange: (quality: ExportQualityId) => void;
  isExporting: boolean;
  onExport: () => void | Promise<void>;
  qualityOptions?: readonly ExportQualityId[];
  qualityLabels?: Partial<Record<ExportQualityId, string>>;
}) {
  const resolvedQualityLabels: Record<ExportQualityId, string> = {
    low: qualityLabels?.low ?? t("qualityLow"),
    medium: qualityLabels?.medium ?? t("qualityMedium"),
    high: qualityLabels?.high ?? t("qualityHigh")
  };

  return (
    <Section title={t("export")} variant="plain" className="border-t-0 pt-0">
      <p className="app-text-subtle text-sm">{cardRef.current ? t("exportHint") : t("previewNotReady")}</p>
      <FieldLabel label={t("exportQuality")}>
        <SegmentedControl<ExportQualityId>
          value={exportQuality}
          onChange={onExportQualityChange}
          columns={qualityOptions.length === 2 ? 2 : 3}
          options={qualityOptions.map((quality) => ({ value: quality, label: resolvedQualityLabels[quality] }))}
        />
      </FieldLabel>
      {isExporting ? <p className="app-text-subtle text-sm">{t("preparingPng")}</p> : null}
    </Section>
  );
}
