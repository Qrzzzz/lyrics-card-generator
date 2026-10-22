"use client";
import { useEffect, useState } from "react";
import { LyricsToolPalette, type AppCommand } from "@/components/editor/LyricsToolPalette";
import { getLyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import { productivityCopy } from "@/lib/editor-productivity-copy";
import { separatorCopy } from "@/lib/lyric-separator-copy";
import { createT } from "@/lib/i18n";
import { useOptionalExportCardReadinessSnapshot, type ExportCardReadinessStore } from "@/components/editor/hooks/export-card-readiness-store";
import type { Locale } from "@/lib/types";
import type { UiTextSize } from "@/lib/settings/types";
import { resolveExportSafetyMessage } from "@/lib/export-safety";

export type CommandDestination = { step: number; field?: string; toolId?: string };
export function AppCommands({ locale, titles, onNavigate, onSettings, onHistory, onExport, onCopy, onTogglePreview,
  guarded, busy, readinessStore, lyricsAvailable, translationEnabled, desktop = true, onTextSizeChange }: {
  locale: Locale; titles: string[]; onNavigate: (destination: CommandDestination) => boolean;
  onSettings?: () => void; onHistory?: () => void; onExport: () => void; onCopy: () => void; onTogglePreview: () => void;
  guarded?: string; busy: boolean; readinessStore: ExportCardReadinessStore; lyricsAvailable: boolean; translationEnabled: boolean; desktop?: boolean;
  onTextSizeChange?: (value: UiTextSize) => void;
}) {
  const [open, setOpen] = useState(false);
  const copy = productivityCopy[locale];
  const t = createT(locale);
  const readiness = useOptionalExportCardReadinessSnapshot(readinessStore);
  useEffect(() => {
    const blockedByModal = () => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(dialog =>
      !dialog.closest('[data-testid="lyrics-sidebar"]') && !(open && dialog.closest('[data-testid="lyrics-tool-palette"]')));
    const show = () => { if (!blockedByModal()) setOpen(true); };
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (blockedByModal()) return;
      event.preventDefault(); event.stopPropagation(); setOpen(value => !value);
    };
    window.addEventListener("lyrics-card:open-commands", show);
    document.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("lyrics-card:open-commands", show); document.removeEventListener("keydown", key, true); };
  }, [open]);
  useEffect(() => {
    const navigate = (event: Event) => onNavigate((event as CustomEvent<CommandDestination>).detail);
    window.addEventListener("lyrics-card:navigate", navigate);
    return () => window.removeEventListener("lyrics-card:navigate", navigate);
  }, [onNavigate]);
  const commands: AppCommand[] = titles.map((label, step) => ({ id: `step-${step}`, label, keywords: `navigate step ${step + 1} 步骤 導覽 étape 手順 paso`,
    disabledReason: guarded, run: () => onNavigate({ step }) }));
  for (const [field, step, words] of [
    ["fontSize", 3, "字号 字級 font size taille tamaño"],
    ["lineHeight", 3, "行距 行间距 行間距 line spacing line height leading interligne 行間 interlineado"],
    ["translationScale", 3, "译文 比例 translation scale traduction 翻訳 traducción"],
    ["background", 2, "背景 background fond 背景 fondo"],
    ["separator", 3, "分隔符 separator séparateur 区切り separador"]
  ] as const) commands.push({ id: `field-${field}`, label: `${copy.field} · ${field === "separator" ? separatorCopy[locale].label : t(field)}`, keywords: words,
    disabledReason: guarded || (field !== "background" && !lyricsAvailable ? copy.lyricsOnly
      : field === "translationScale" && !translationEnabled ? copy.translationOnly : undefined), run: () => onNavigate({ step, field }) });
  if (onSettings) commands.push({ id: "settings", label: copy.settings, keywords: "设置 設定 settings réglages ajustes Ctrl+,", disabledReason: guarded, run: onSettings });
  if (onHistory) commands.push({ id: "history", label: copy.history, keywords: "历史 歷史 history historique 履歴 historial", disabledReason: guarded, run: onHistory });
  if (onTextSizeChange) (["standard", "large", "extra-large"] as const).forEach((value, index) => commands.push({
    id: `text-size-${value}`, label: `${copy.uiSize} · ${copy.sizes[index]}`, keywords: "interface text size 字号 字級 taille interfaz 文字サイズ",
    disabledReason: guarded, run: () => onTextSizeChange(value)
  }));
  const outputReason = guarded || (busy ? copy.busy : readiness?.isReady === false
    ? readiness.blockingReason ? resolveExportSafetyMessage(readiness.blockingReason, readiness.lineStatus.totalLineCount, t, readiness.lineStatus.maxLineCount) : copy.blocked
    : undefined);
  commands.push({ id: "export", label: copy.export, keywords: "导出 匯出 export png webp jpg 保存 書き出し", disabledReason: outputReason, run: onExport },
    { id: "copy", label: copy.copy, keywords: "复制 複製 clipboard copy copier コピー copiar", disabledReason: outputReason, run: onCopy },
    { id: "preview", label: copy.preview, keywords: "预览 預覽 preview aperçu プレビュー vista", disabledReason: guarded, run: onTogglePreview });
  return <LyricsToolPalette open={open} onClose={() => setOpen(false)} title={copy.commands} commands={commands}
    onActivate={(tool) => onNavigate({ step: 1, toolId: tool.id })} copy={getLyricsWorkspaceCopy(locale)} locale={locale}
    showAiTranslate={desktop && lyricsAvailable} hasFetch={desktop && lyricsAvailable} lyricsAvailable={lyricsAvailable} lyricsDisabledReason={guarded} />;
}

/** Wait for the existing page to mount before routing a command through its UI. */
export function focusCommandDestination(destination: CommandDestination) {
  let attempt = 0;
  function focus() {
    const stepId = ["link", "lyrics", "layout", "font", "visual", "export"][destination.step];
    const active = [...document.querySelectorAll<HTMLElement>(`[data-settings-step-id="${stepId}"]`)]
      .find(node => node.getClientRects().length && !node.closest("[inert], [aria-hidden=true]"));
    const scope = active ?? document;
    const field = destination.field;
    const target = field === "separator" ? scope.querySelector<HTMLElement>('[data-testid="separator-style-settings"] button')
      : field ? scope.querySelector<HTMLElement>(`[data-setting-target="${field}"] ${field === "background" ? "button" : '[role="spinbutton"]'}`)
      : destination.step === 1 ? scope.querySelector<HTMLElement>('[data-testid="lyrics-editor-original"]')
      : scope.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    if (destination.toolId) {
      const workspace = document.querySelector<HTMLElement>('[data-testid="lyrics-editor-original"]');
      if (workspace && !workspace.closest("[inert], [aria-hidden=true]")) { window.dispatchEvent(new CustomEvent("lyrics-card:activate-tool", { detail: destination.toolId })); return; }
    } else if (target && !target.closest("[inert], [aria-hidden=true]")) {
      target.scrollIntoView({ block: "nearest" }); target.focus({ preventScroll: true }); return;
    }
    if (++attempt < 90) requestAnimationFrame(focus);
  }
  requestAnimationFrame(focus);
}
