import { Input, Label, Select } from "@/components/ui/controls";
import { getContrastRatio } from "@/lib/color/contrast";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function AppearanceSettingsSection({ settings, copy, onChange }: { settings: UserSettings; copy: typeof settingsCopy[Locale]; onChange: (settings: UserSettings) => void }) {
  const customContrast = getContrastRatio(settings.uiCustomTextColor, settings.uiTheme === "light-blue" ? "#EAF6FF" : "#080910");
  return <section className="settings-panel-card grid gap-4 p-4 sm:p-5">
    <Label label={copy.theme}><Select value={settings.uiTheme} onChange={(event) => onChange({ ...settings, uiTheme: event.target.value as UserSettings["uiTheme"] })}><option value="album-dynamic">{copy.albumDynamic}</option><option value="light-blue">{copy.lightBlue}</option><option value="dark-pink">{copy.darkPink}</option><option value="custom">{copy.custom}</option></Select></Label>
    <Label label={copy.uiFont} hint={copy.defaultFont}><Input value={settings.uiFontFamily} onChange={(event) => onChange({ ...settings, uiFontFamily: event.target.value })} placeholder="Segoe UI, sans-serif" /></Label>
    <div className="grid gap-4 sm:grid-cols-2"><Label label={copy.accent}><Input type="color" value={settings.uiAccentColor} onChange={(event) => onChange({ ...settings, uiAccentColor: event.target.value })} /></Label><Label label={copy.textColor}><Select value={settings.uiTextColorMode} onChange={(event) => onChange({ ...settings, uiTextColorMode: event.target.value as UserSettings["uiTextColorMode"] })}><option value="auto">{copy.auto}</option><option value="light">{copy.light}</option><option value="dark">{copy.dark}</option><option value="custom">{copy.custom}</option></Select></Label></div>
    {settings.uiTextColorMode === "custom" ? <Label label={copy.textColor}><Input type="color" value={settings.uiCustomTextColor} onChange={(event) => onChange({ ...settings, uiCustomTextColor: event.target.value })} />{customContrast < 4.5 ? <span className="text-xs text-amber-200">{copy.invalidContrast}</span> : null}</Label> : null}
  </section>;
}
