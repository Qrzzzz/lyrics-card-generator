"use client";

import { FileImage, ImageDown, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import { FieldLabel, Section, SegmentedControl } from "@/components/ui/controls";
import type { ExportQualityId } from "@/lib/settings/types";
import type { createT } from "@/lib/i18n";

export function ExportPanel({
  cardRef,
  t,
  accentColor,
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
  const reduceMotion = useReducedMotion();
  const previewMessage = cardRef.current ? t("exportHint") : t("previewNotReady");

  return (
    <Section
      title={t("export")}
      variant="plain"
      className="border-t-0 pt-0"
      contentClassName="gap-4"
    >
      <div
        aria-busy={isExporting}
        className="relative isolate overflow-hidden rounded-2xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:px-5"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-20 h-44 w-44 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: accentColor }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
          style={{
            background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${accentColor} 70%, white), transparent)`
          }}
        />

        <div className="relative flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_12px_30px_rgba(0,0,0,0.18)]"
            style={{
              borderColor: `color-mix(in srgb, ${accentColor} 32%, rgb(var(--panel-border)))`,
              background: `linear-gradient(145deg, color-mix(in srgb, ${accentColor} 22%, rgb(var(--button-bg-hover))), rgb(var(--button-bg)))`,
              color: accentColor
            }}
          >
            <FileImage className="size-5" strokeWidth={1.8} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="app-text-primary text-sm font-semibold leading-6">{previewMessage}</p>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.14em]"
                style={{
                  borderColor: `color-mix(in srgb, ${accentColor} 24%, rgb(var(--panel-border)))`,
                  backgroundColor: `color-mix(in srgb, ${accentColor} 10%, transparent)`,
                  color: `color-mix(in srgb, ${accentColor} 74%, var(--app-text-primary))`
                }}
              >
                PNG
              </span>
            </div>
            <div className="app-text-subtle mt-1 flex items-center gap-1.5 text-xs">
              <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
              <span>{t("exportQuality")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5">
        <FieldLabel label={t("exportQuality")} className="gap-3">
          <SegmentedControl<ExportQualityId>
            value={exportQuality}
            onChange={onExportQualityChange}
            columns={qualityOptions.length === 2 ? 2 : 3}
            ariaLabel={t("exportQuality")}
            options={qualityOptions.map((quality) => ({ value: quality, label: resolvedQualityLabels[quality] }))}
          />
        </FieldLabel>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-0">
        <AnimatePresence initial={false}>
          {isExporting ? (
            <motion.div
              key="export-progress"
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden rounded-2xl border px-4 py-4"
              style={{
                borderColor: `color-mix(in srgb, ${accentColor} 28%, rgb(var(--panel-border)))`,
                background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 12%, rgb(var(--panel-bg))), rgb(var(--panel-bg)) 64%)`
              }}
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
                  <ImageDown className="size-4" style={{ color: accentColor }} strokeWidth={2} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="app-text-primary text-sm font-semibold">{t("preparingPng")}</p>
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
    </Section>
  );
}
