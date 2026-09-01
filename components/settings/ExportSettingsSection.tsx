import { FieldLabel, SegmentedControl, TextInput, ToggleRow } from "@/components/ui/controls";
import { SettingsGroup } from "@/components/settings/SettingsLayout";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";
import { EXPORT_FORMAT_OPTIONS, EXPORT_QUALITY_OPTIONS, type UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function ExportSettingsSection({
  settings,
  copy,
  onChange
}: {
  settings: UserSettings;
  copy: typeof settingsCopy[Locale];
  onChange: (settings: UserSettings) => void;
}) {
  recordRenderBoundary("SettingsExport");
  const labels = { low: copy.low, medium: copy.medium, high: copy.high };

  return (
    <section className="grid gap-5">
      <SettingsGroup title={copy.newCardDefaults} description={copy.newCardDefaultsDescription}>
        <div className="grid gap-1" data-testid="new-card-defaults-group">
        <ToggleRow
          label={copy.defaultGeneratedWatermark}
          description={copy.defaultGeneratedWatermarkDescription}
          checked={settings.defaultShowGeneratedWatermark}
          onChange={(defaultShowGeneratedWatermark) => onChange({ ...settings, defaultShowGeneratedWatermark })}
          testId="default-generated-watermark-toggle"
        />
        <ToggleRow
          label={copy.defaultSharedBy}
          description={copy.defaultSharedByDescription}
          checked={settings.defaultShowSharedBy}
          onChange={(defaultShowSharedBy) => onChange({ ...settings, defaultShowSharedBy })}
          testId="default-shared-by-toggle"
        />
        {settings.defaultShowSharedBy ? (
          <FieldLabel label={copy.defaultSharedByText}>
            <TextInput
              value={settings.defaultSharedByText}
              maxLength={120}
              onChange={(event) => onChange({ ...settings, defaultSharedByText: event.target.value })}
              placeholder={copy.defaultSharedByPlaceholder}
              data-testid="default-shared-by-text"
            />
          </FieldLabel>
        ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup title={copy.fileExportDefaults} description={copy.fileExportDefaultsDescription}>
        <div className="grid gap-5" data-testid="file-export-defaults-group">
          <FieldLabel label={copy.exportFormat}>
            <SegmentedControl
              value={settings.defaultExportFormat}
              onChange={(defaultExportFormat) => onChange({ ...settings, defaultExportFormat })}
              columns={3}
              ariaLabel={copy.exportFormat}
              options={EXPORT_FORMAT_OPTIONS.map((option) => ({
                value: option.id,
                label: option.id === "webp" ? "WebP" : option.id.toUpperCase()
              }))}
            />
          </FieldLabel>

          <FieldLabel label={copy.exportQuality}>
            <SegmentedControl
              value={settings.defaultExportQuality}
              ariaLabel={copy.exportQuality}
              onChange={(quality) => {
                // Quality and pixel ratio are persisted as one compatibility invariant.
                const option = EXPORT_QUALITY_OPTIONS.find((item) => item.id === quality)!;
                onChange({
                  ...settings,
                  defaultExportQuality: option.id,
                  defaultExportPixelRatio: option.pixelRatio
                });
              }}
              columns={3}
              options={EXPORT_QUALITY_OPTIONS.map((option) => ({
                value: option.id,
                label: labels[option.id]
              }))}
            />
          </FieldLabel>
        </div>
      </SettingsGroup>
    </section>
  );
}
