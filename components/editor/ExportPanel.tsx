"use client";

import { AlertTriangle, ClipboardCopy, ImageDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import {
  useOptionalExportCardReadinessSnapshot,
  type ExportCardReadinessStore
} from "@/components/editor/hooks/export-card-readiness-store";
import { SettingsGrid } from "@/components/ui/SettingsLayout";
import { ActionButton, FieldLabel, Section, SegmentedControl } from "@/components/ui/controls";
import { editorRecoveryCopy } from "@/lib/editor-recovery-copy";
import type { ImageOutputFailure } from "@/lib/image-output-controller";
import type { Locale } from "@/lib/types";
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
  qualityLabels,
  locale = "en", outputFailure, onRetryOutput
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
  locale?: Locale;
  outputFailure?: ImageOutputFailure | null;
  onRetryOutput?: () => void | Promise<void>;
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
  const recovery = editorRecoveryCopy[locale];

  return (
    <Section
      title={t("export")}
      variant="plain"
      className="settings-content-layout border-t-0 pt-0"
      contentClassName="gap-4"
    >
      <div aria-busy={isExporting} className="grid gap-4">
        {outputFailure ? (
          <div role="alert" data-testid="output-failure" data-output-action={outputFailure.action} className="status-danger grid gap-3 rounded-lg border p-3 text-sm">
            <p className="font-semibold">{outputFailure.action === "copy" ? recovery.copyFailed : recovery.exportFailed}</p>
            <p>{outputFailure.message}</p>
            {outputFailure.reason === "failed" ? <p>{recovery.outputDetail}</p> : null}
            <ActionButton data-testid="retry-image-output" disabled={isExporting || readiness?.isReady === false} onClick={() => void onRetryOutput?.()}>{recovery.retry}</ActionButton>
          </div>
        ) : null}
        {resolvedBlockingMessage ? (
          <div
            role="alert"
            className="status-warning flex items-start gap-3 rounded-lg border px-3 py-3 text-sm leading-relaxed"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{resolvedBlockingMessage}</span>
          </div>
        ) : null}
        <SettingsGrid>
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

        </SettingsGrid>
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
