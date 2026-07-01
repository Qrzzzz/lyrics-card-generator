import { FieldLabel, SelectField } from "@/components/ui/controls";
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
  const labels = { low: copy.low, medium: copy.medium, high: copy.high, ultra: copy.ultra };

  return (
    <section className="grid gap-4">
      <FieldLabel label={copy.exportQuality}>
        <SelectField
          value={settings.defaultExportQuality}
          onChange={(event) => {
            const option = EXPORT_QUALITY_OPTIONS.find((item) => item.id === event.target.value)!;
            onChange({
              ...settings,
              defaultExportQuality: option.id,
              defaultExportPixelRatio: option.pixelRatio
            });
          }}
        >
          {EXPORT_QUALITY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {labels[option.id]}
            </option>
          ))}
        </SelectField>
      </FieldLabel>
    </section>
  );
}
