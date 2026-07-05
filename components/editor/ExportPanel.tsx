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
  isExporting
}: {
  cardRef: RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
  accentColor: string;
  exportQuality: ExportQualityId;
  onExportQualityChange: (quality: ExportQualityId) => void;
  isExporting: boolean;
  onExport: () => void | Promise<void>;
}) {
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
      {isExporting ? <p className="app-text-subtle text-sm">{t("preparingPng")}</p> : null}
    </Section>
  );
}
