import { FieldLabel, SelectField, TextInput } from "@/components/ui/controls";
import { getContrastRatio } from "@/lib/color/contrast";
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
  const themeBackground =
    settings.uiTheme === "light-blue"
      ? "#EAF6FF"
      : settings.uiTheme === "light-acrylic"
        ? "#F3F6FA"
        : settings.uiTheme === "dark-acrylic"
          ? "#141821"
          : "#080910";
  const customContrast = getContrastRatio(settings.uiCustomTextColor, themeBackground);

  return (
    <section className="grid gap-4">
      <FieldLabel label={copy.theme}>
        <SelectField
          value={settings.uiTheme}
          onChange={(event) => onChange({ ...settings, uiTheme: event.target.value as UserSettings["uiTheme"] })}
        >
          <option value="album-dynamic">{copy.albumDynamic}</option>
          <option value="light-blue">{copy.lightBlue}</option>
          <option value="dark-pink">{copy.darkPink}</option>
          <option value="dark-acrylic">{copy.darkAcrylic}</option>
          <option value="light-acrylic">{copy.lightAcrylic}</option>
          <option value="custom">{copy.custom}</option>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldLabel label={copy.accent}>
          <TextInput
            type="color"
            value={settings.uiAccentColor}
            onChange={(event) => onChange({ ...settings, uiAccentColor: event.target.value })}
          />
        </FieldLabel>

        <FieldLabel label={copy.textColor}>
          <SelectField
            value={settings.uiTextColorMode}
            onChange={(event) =>
              onChange({ ...settings, uiTextColorMode: event.target.value as UserSettings["uiTextColorMode"] })
            }
          >
            <option value="auto">{copy.auto}</option>
            <option value="light">{copy.light}</option>
            <option value="dark">{copy.dark}</option>
            <option value="custom">{copy.custom}</option>
          </SelectField>
        </FieldLabel>
      </div>

      {settings.uiTextColorMode === "custom" ? (
        <FieldLabel label={copy.textColor}>
          <TextInput
            type="color"
            value={settings.uiCustomTextColor}
            onChange={(event) => onChange({ ...settings, uiCustomTextColor: event.target.value })}
          />
          {customContrast < 4.5 ? <span className="text-xs text-amber-200">{copy.invalidContrast}</span> : null}
        </FieldLabel>
      ) : null}
    </section>
  );
}
