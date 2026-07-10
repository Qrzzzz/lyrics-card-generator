import { FieldLabel, SegmentedControl } from "@/components/ui/controls";
import { EXPORT_QUALITY_OPTIONS, type UserSettings } from "@/lib/settings/types";
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
  const labels = { low: copy.low, medium: copy.medium, high: copy.high };

  return (
    <section className="grid gap-4">
      <FieldLabel label={copy.exportQuality}>
        <SegmentedControl
          value={settings.defaultExportQuality}
          onChange={(quality) => {
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
    </section>
  );
}
