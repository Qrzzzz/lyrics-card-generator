"use client";

import { LanguageSettingsSection } from "@/components/settings/LanguageSettingsSection";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";
import { FieldLabel, SelectField, ToggleRow } from "@/components/ui/controls";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import {
  formatImportHistoryText,
  importHistoryCopy
} from "@/lib/import-history-copy";
import type { ImportHistoryLimit } from "@/lib/import-history";
import type { AppPreferencesPersistenceOptions } from "@/lib/settings/app-preferences";
import type { UserSettings } from "@/lib/settings/types";
import { systemDialogCopy } from "@/lib/system-dialog-copy";
import { showSystemAlert, showSystemConfirm } from "@/lib/system-dialog";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function GeneralSettingsSection({
  locale,
  copy,
  settings,
  showImportHistorySettings,
  onLocaleChange,
  onChange
}: {
  locale: Locale;
  copy: typeof settingsCopy[Locale];
  settings: UserSettings;
  showImportHistorySettings: boolean;
  onLocaleChange: (locale: Locale) => void;
  onChange: (settings: UserSettings, options?: AppPreferencesPersistenceOptions) => void;
}) {
  recordRenderBoundary("SettingsGeneral");
  const historyCopy = importHistoryCopy[locale];

  async function changeImportHistoryLimit(next: ImportHistoryLimit) {
    const current = settings.importHistoryLimit;
    const decreasing = next !== "unlimited" && (current === "unlimited" || next < current);
    let options: AppPreferencesPersistenceOptions | undefined;
    if (decreasing) {
      const desktop = getLyricsCardDesktopApi();
      if (desktop) {
        try {
          // The confirmed store version prevents trimming records changed after this prompt.
          const { total, version } = await desktop.getImportHistoryStats();
          const trimmed = Math.max(0, total - next);
          if (trimmed > 0) {
            const dialogCopy = systemDialogCopy[locale];
            const confirmed = await showSystemConfirm({
              type: "warning",
              title: dialogCopy.appTitle,
              message: dialogCopy.trimHistoryTitle,
              detail: formatImportHistoryText(historyCopy.limitTrimConfirm, {
                limit: next,
                count: trimmed
              }),
              confirmLabel: dialogCopy.continue,
              cancelLabel: dialogCopy.cancel
            });
            if (!confirmed) return;
          }
          if (trimmed > 0) {
            options = {
              importHistoryTrimConfirmation: {
                expectedVersion: version,
                confirmedTrimCount: trimmed
              }
            };
          }
        } catch {
          const dialogCopy = systemDialogCopy[locale];
          await showSystemAlert({
            type: "error",
            title: dialogCopy.appTitle,
            message: dialogCopy.historyCheckFailedTitle,
            detail: historyCopy.limitStatsFailed,
            closeLabel: dialogCopy.close
          });
          return;
        }
      }
    }
    onChange({ ...settings, importHistoryLimit: next }, options);
  }

  return (
    <section className="grid gap-4">
      <LanguageSettingsSection locale={locale} title={copy.language} onLocaleChange={onLocaleChange} />
      <ToggleRow
        label={copy.reduceMotion}
        description={copy.reduceMotionDescription}
        checked={settings.reduceMotionEnabled}
        onChange={(reduceMotionEnabled) => onChange({ ...settings, reduceMotionEnabled })}
        testId="reduce-motion-toggle"
      />
      {showImportHistorySettings ? (
        <FieldLabel
          label={historyCopy.limitLabel}
          description={historyCopy.limitDescription}
        >
          <SelectField
            value={String(settings.importHistoryLimit)}
            data-testid="import-history-limit"
            onChange={(event) => {
              const value = event.target.value;
              void changeImportHistoryLimit(value === "unlimited" ? "unlimited" : value === "5" ? 5 : 10);
            }}
          >
            <option value="5">{historyCopy.limitFive}</option>
            <option value="10">{historyCopy.limitTen}</option>
            <option value="unlimited">{historyCopy.limitUnlimited}</option>
          </SelectField>
        </FieldLabel>
      ) : null}
    </section>
  );
}
