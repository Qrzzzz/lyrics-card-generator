import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LayoutSettingsPanel, FontSchemeSettingsPanel, VisualSettingsPanel } from "../../../components/editor/StylePanel";
import { AppMotionProvider } from "../../../components/motion/AppMotionProvider";
import { defaultState } from "../../../components/editor/editor-defaults";
import { createT } from "../../../lib/i18n";
import type { Locale } from "../../../lib/types";

const query = new URLSearchParams(location.search);
const locale = (query.get("locale") ?? "en") as Locale;
const theme = query.get("theme") ?? "dark";
document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
document.body.dataset.uiTheme = theme;

function Fixture() {
  const [style, setStyle] = useState({ ...defaultState.style, translationEnabled: true, showSharedBy: true, showFineGrid: true });
  const [song, setSong] = useState(defaultState.song);
  const [step, setStep] = useState("layout");
  const Panel = step === "layout" ? LayoutSettingsPanel : step === "font" ? FontSchemeSettingsPanel : VisualSettingsPanel;
  return (
    <AppMotionProvider reduceMotion>
      <main className="app-shell" data-ui-theme={theme} style={{ padding: 16, minHeight: "100vh", backgroundColor: theme.startsWith("light") ? "#ffffff" : "#08090c" }}>
        <nav aria-label="Test steps" style={{ display: "flex", gap: 20, marginBottom: 16 }}>
          {["layout", "font", "visual"].map((id) => <button key={id} onClick={() => setStep(id)} data-step={id}>{id}</button>)}
        </nav>
        <div data-testid="settings-fixture" style={{ width: 768, maxWidth: "100%" }}>
          <Panel style={style} onStyleChange={setStyle} song={song} onSongChange={setSong} locale={locale} t={createT(locale)} />
        </div>
        <output data-testid="settings-state" hidden>{JSON.stringify({ style, song })}</output>
      </main>
    </AppMotionProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
