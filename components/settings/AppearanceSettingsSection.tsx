import { FieldLabel, SelectField, TextInput } from "@/components/ui/controls";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function AppearanceSettingsSection({
  settings,
  copy,
  onChange
}: {
  settings: UserSettings;
  copy: typeof settingsCopy[Locale];
  onChange: (settings: UserSettings) => void;
}) {
  return (
    <section className="grid gap-4">
      <FieldLabel label={copy.theme}>
        <SelectField
          value={settings.uiTheme}
          onChange={(event) => onChange({ ...settings, uiTheme: event.target.value as UserSettings["uiTheme"] })}
        >
          <option value="album-dynamic">{copy.albumDynamic}</option>
          <option value="dark">{copy.dark}</option>
          <option value="light">{copy.light}</option>
          <option value="dark-acrylic">{copy.darkAcrylic}</option>
          <option value="light-acrylic">{copy.lightAcrylic}</option>
        </SelectField>
      </FieldLabel>

      {settings.uiTheme === "dark-acrylic" || settings.uiTheme === "light-acrylic" ? (
        <p className="settings-tip px-3 py-2 text-xs leading-relaxed">{copy.acrylicSupportNote}</p>
      ) : null}

      <FieldLabel label={copy.uiFont} hint={copy.defaultFont}>
        <TextInput
          value={settings.uiFontFamily}
          onChange={(event) => onChange({ ...settings, uiFontFamily: event.target.value })}
          placeholder="Segoe UI, sans-serif"
        />
      </FieldLabel>
    </section>
  );
}
