import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LayoutSettingsPanel, FontSchemeSettingsPanel, VisualSettingsPanel } from "../../../components/editor/StylePanel";
import { AppMotionProvider } from "../../../components/motion/AppMotionProvider";
import { defaultState } from "../../../components/editor/editor-defaults";
import { createT } from "../../../lib/i18n";
import type { Locale } from "../../../lib/types";
import { AppearanceSettingsSection } from "../../../components/settings/AppearanceSettingsSection";
import { GeneralSettingsSection } from "../../../components/settings/GeneralSettingsSection";
import { ActionButton } from "../../../components/ui/controls";
import { settingsCopy } from "../../../lib/settings/copy";
import { normalizeUserSettings } from "../../../lib/settings/user-settings";

const query = new URLSearchParams(location.search);
const locale = (query.get("locale") ?? "en") as Locale;
const theme = query.get("theme") ?? "dark";
document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
document.body.dataset.uiTheme = theme;

function Fixture() {
  const [style, setStyle] = useState({ ...defaultState.style, translationEnabled: true, showSharedBy: true, showFineGrid: true });
  const [song, setSong] = useState(defaultState.song);
  const [step, setStep] = useState("layout");
  const [preferences, setPreferences] = useState(() => normalizeUserSettings({ uiFontFamily: "Arial" }));
  const Panel = step === "layout" ? LayoutSettingsPanel : step === "font" ? FontSchemeSettingsPanel : VisualSettingsPanel;
  return (
    <AppMotionProvider reduceMotion>
      <main className="app-shell" data-ui-theme={theme} style={{ padding: 16, minHeight: "100vh", backgroundColor: theme.startsWith("light") ? "#ffffff" : "#08090c" }}>
        <nav aria-label="Test steps" style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 16 }}>
          {["layout", "font", "visual", "appearance", "general", "buttons"].map((id) => <button key={id} onClick={() => setStep(id)} data-step={id}>{id}</button>)}
        </nav>
        <div data-testid="settings-fixture" style={{ width: 768, maxWidth: "100%" }}>
          {step === "appearance" ? <div className="settings-content-layout">
            <AppearanceSettingsSection settings={preferences} onChange={setPreferences} locale={locale} copy={settingsCopy[locale]} isDesktopShell={false} />
          </div> : step === "general" ? <div className="settings-content-layout">
            <GeneralSettingsSection settings={preferences} onChange={setPreferences} locale={locale} copy={settingsCopy[locale]} showImportHistorySettings={false} onLocaleChange={() => undefined} />
          </div> : step === "buttons" ? <div className="settings-content-layout grid gap-3">
            <div className="flex flex-wrap gap-2">
              <ActionButton size="sm" data-testid="compact-action">{settingsCopy[locale].restoreSystemFont}</ActionButton>
              <ActionButton data-testid="regular-action">{settingsCopy[locale].restoreSystemFont}</ActionButton>
              <ActionButton className="px-2" data-testid="custom-padding-action">{settingsCopy[locale].restoreSystemFont}</ActionButton>
            </div>
          </div> : <Panel style={style} onStyleChange={setStyle} song={song} onSongChange={setSong} locale={locale} t={createT(locale)} />}
        </div>
        <output data-testid="settings-state" hidden>{JSON.stringify({ style, song })}</output>
      </main>
    </AppMotionProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
