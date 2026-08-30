"use client";

import { AlertTriangle, ClipboardCopy, ImageDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import {
  useOptionalExportCardReadinessSnapshot,
  type ExportCardReadinessStore
} from "@/components/editor/hooks/export-card-readiness-store";
import { FieldLabel, Section, SegmentedControl } from "@/components/ui/controls";
import { resolveExportSafetyMessage } from "@/lib/export-safety";
import { EXPORT_FORMAT_OPTIONS, type ExportFormatId, type ExportQualityId } from "@/lib/settings/types";
import type { createT } from "@/lib/i18n";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";

export function ExportPanel({
  t,
  accentColor,
  exportFormat,
  onExportFormatChange,
  exportQuality,
  onExportQualityChange,
  isExporting,
  isCopying = false,
  blockingMessage,
  readinessStore,
  qualityOptions = ["low", "medium", "high"],
  qualityLabels
}: {
  t: ReturnType<typeof createT>;
  accentColor: string;
  exportFormat: ExportFormatId;
  onExportFormatChange: (format: ExportFormatId) => void;
  exportQuality: ExportQualityId;
  onExportQualityChange: (quality: ExportQualityId) => void;
  isExporting: boolean;
  isCopying?: boolean;
  blockingMessage?: string;
  readinessStore?: ExportCardReadinessStore;
  qualityOptions?: readonly ExportQualityId[];
  qualityLabels?: Partial<Record<ExportQualityId, string>>;
}) {
  recordRenderBoundary("ExportPanel");
  const readiness = useOptionalExportCardReadinessSnapshot(readinessStore);
  const resolvedBlockingMessage = blockingMessage ?? (
    readiness?.blockingReason
      ? resolveExportSafetyMessage(readiness.blockingReason, readiness.lineStatus.totalLineCount, t, readiness.lineStatus.maxLineCount)
      : undefined
  );
  const resolvedQualityLabels: Record<ExportQualityId, string> = {
    low: qualityLabels?.low ?? t("qualityLow"),
    medium: qualityLabels?.medium ?? t("qualityMedium"),
    high: qualityLabels?.high ?? t("qualityHigh")
  };
  const reduceMotion = useAppReducedMotion();

  return (
    <Section
      title={t("export")}
      variant="plain"
      className="border-t-0 pt-0"
      contentClassName="gap-4"
    >
      <div aria-busy={isExporting} className="grid gap-4">
        {resolvedBlockingMessage ? (
          <div
            role="alert"
            className="status-warning flex items-start gap-3 rounded-lg border px-3 py-3 text-sm leading-relaxed"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{resolvedBlockingMessage}</span>
          </div>
        ) : null}
        <FieldLabel label={t("exportFormat")} className="gap-3">
          <SegmentedControl<ExportFormatId>
            value={exportFormat}
            onChange={onExportFormatChange}
            columns={3}
            ariaLabel={t("exportFormat")}
            options={EXPORT_FORMAT_OPTIONS.map((format) => ({
              value: format.id,
              label: format.id === "webp" ? "WebP" : format.id.toUpperCase()
            }))}
          />
        </FieldLabel>
        <FieldLabel label={t("exportQuality")} className="gap-3">
          <SegmentedControl<ExportQualityId>
            value={exportQuality}
            onChange={onExportQualityChange}
            columns={qualityOptions.length === 2 ? 2 : 3}
            ariaLabel={t("exportQuality")}
            options={qualityOptions.map((quality) => ({ value: quality, label: resolvedQualityLabels[quality] }))}
          />
        </FieldLabel>

        <div role="status" aria-live="polite" aria-atomic="true" className="min-h-0">
          <AnimatePresence initial={false}>
            {isExporting ? (
              <motion.div
                key="export-progress"
                initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden px-1 py-3 sm:px-2"
              >
                <div className="relative flex items-center gap-4">
                  <div className="relative flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
                    <span
                      className="absolute inset-0 rounded-full border"
                      style={{ borderColor: `color-mix(in srgb, ${accentColor} 18%, rgb(var(--panel-border)))` }}
                    />
                    <motion.span
                      className="absolute inset-0 rounded-full border-2 border-transparent"
                      style={{ borderTopColor: accentColor, borderRightColor: accentColor }}
                      animate={reduceMotion ? undefined : { rotate: 360 }}
                      transition={
                        reduceMotion
                          ? undefined
                          : { duration: 1.35, repeat: Number.POSITIVE_INFINITY, ease: "linear" }
                      }
                    />
                    {isCopying ? (
                      <ClipboardCopy className="size-4" style={{ color: accentColor }} strokeWidth={2} />
                    ) : (
                      <ImageDown className="size-4" style={{ color: accentColor }} strokeWidth={2} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="app-text-primary text-sm font-semibold">
                      {isCopying
                        ? t("preparingCopy")
                        : t("preparingImage", { format: exportFormat === "webp" ? "WebP" : exportFormat.toUpperCase() })}
                    </p>
                    <div
                      aria-hidden="true"
                      className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--button-bg))]"
                    >
                      <motion.span
                        className="block h-full w-2/5 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${accentColor}, color-mix(in srgb, ${accentColor} 70%, white))`
                        }}
                        animate={reduceMotion ? { x: "75%" } : { x: ["-120%", "260%"] }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { duration: 1.65, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
                        }
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}
