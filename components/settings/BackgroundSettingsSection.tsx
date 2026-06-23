import { useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/controls";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { extractAverageColor, removeBackgroundImage, storeBackgroundImage } from "@/lib/settings/background-storage";
import { DEFAULT_USER_SETTINGS, type AppBackgroundMode, type UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function BackgroundSettingsSection({ settings, copy, onChange }: { settings: UserSettings; copy: typeof settingsCopy[Locale]; onChange: (settings: UserSettings) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isImage = settings.appBackground.mode.startsWith("image-");
  const update = (partial: Partial<UserSettings["appBackground"]>) => onChange({ ...settings, appBackground: { ...settings.appBackground, ...partial } });

  async function chooseImage(file?: File) {
    setBusy(true);
    try {
      const result = await storeBackgroundImage(file ?? new File([], "desktop-image"));
      if (!result) return;
      const source = file?.size ? file : await fetch(result.imageUrl).then((response) => response.blob());
      const extractedColor = await extractAverageColor(source).catch(() => settings.uiAccentColor);
      update({ imageId: result.imageId, imageUrl: result.imageUrl, extractedColor, mode: settings.appBackground.mode === "album-dynamic" || settings.appBackground.mode === "solid" ? "image-cover" : settings.appBackground.mode });
    } finally { setBusy(false); }
  }

  async function reset() {
    await removeBackgroundImage(settings.appBackground.imageId);
    onChange({ ...settings, appBackground: { ...DEFAULT_USER_SETTINGS.appBackground } });
  }

  return <section className="settings-panel-card grid gap-4 p-4 sm:p-5">
    <Label label={copy.source}><Select value={settings.appBackground.mode} onChange={(event) => update({ mode: event.target.value as AppBackgroundMode })}><option value="album-dynamic">{copy.albumDynamic}</option><option value="solid">{copy.solid}</option><option value="image-stretch">{copy.stretch}</option><option value="image-contain">{copy.contain}</option><option value="image-cover">{copy.cover}</option><option value="image-blur">{copy.blur}</option><option value="image-palette">{copy.palette}</option></Select></Label>
    {settings.appBackground.mode === "solid" ? <Label label={copy.solid}><Input type="color" value={settings.appBackground.solidColor} onChange={(event) => update({ solidColor: event.target.value })} /></Label> : null}
    {isImage ? <><input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseImage(file); event.currentTarget.value = ""; }} /><button type="button" disabled={busy} onClick={() => getLyricsCardDesktopApi() ? void chooseImage() : inputRef.current?.click()} className="app-button inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"><ImagePlus className="h-4 w-4" />{copy.chooseImage}</button></> : null}
    <Label label={copy.overlay} hint={`${Math.round(settings.appBackground.overlayOpacity * 100)}%`}><Input type="range" min="0" max="0.9" step="0.02" value={settings.appBackground.overlayOpacity} onChange={(event) => update({ overlayOpacity: Number(event.target.value) })} /></Label>
    {settings.appBackground.mode === "image-blur" ? <Label label={copy.blurAmount} hint={`${settings.appBackground.blurAmount}px`}><Input type="range" min="0" max="80" value={settings.appBackground.blurAmount} onChange={(event) => update({ blurAmount: Number(event.target.value) })} /></Label> : null}
    <button type="button" onClick={() => void reset()} className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" />{copy.resetBackground}</button>
  </section>;
}
