import { useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { ActionButton, FieldLabel, SelectField, TextInput } from "@/components/ui/controls";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { extractAverageColor, storeBackgroundImage } from "@/lib/settings/background-storage";
import { DEFAULT_USER_SETTINGS, type AppBackgroundMode, type UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function BackgroundSettingsSection({
  settings,
  copy,
  onChange,
  onImageStored
}: {
  settings: UserSettings;
  copy: typeof settingsCopy[Locale];
  onChange: (settings: UserSettings) => void;
  onImageStored: (asset: { imageId: string; imageUrl: string }) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = (partial: Partial<UserSettings["appBackground"]>) =>
    onChange({ ...settings, appBackground: { ...settings.appBackground, ...partial } });

  async function chooseImage(file?: File) {
    setBusy(true);
    setMessage("");
    try {
      const result = await storeBackgroundImage(file ?? new File([], "desktop-image"));
      if (!result) return;
      const source = file?.size ? file : await fetch(result.imageUrl).then((response) => response.blob());
      const extractedColor = await extractAverageColor(source).catch(() => settings.uiAccentColor);
      if (!await onImageStored(result)) return;
      update({
        imageId: result.imageId,
        imageUrl: result.imageUrl,
        extractedColor,
        mode:
          settings.appBackground.mode === "album-dynamic" || settings.appBackground.mode === "solid"
            ? "image-cover"
            : settings.appBackground.mode
      });
      setMessage(copy.backgroundImageSelected);
    } catch {
      setMessage(copy.backgroundImageFailed);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    onChange({ ...settings, appBackground: { ...DEFAULT_USER_SETTINGS.appBackground } });
    setMessage(copy.backgroundResetPending);
  }

  return (
    <section className="settings-panel-card grid gap-4 p-4 sm:p-5">
      <FieldLabel label={copy.source}>
        <SelectField
          value={settings.appBackground.mode}
          onChange={(event) => update({ mode: event.target.value as AppBackgroundMode })}
        >
          <option value="album-dynamic">{copy.albumDynamic}</option>
          <option value="solid">{copy.solid}</option>
          <option value="image-stretch">{copy.stretch}</option>
          <option value="image-contain">{copy.contain}</option>
          <option value="image-cover">{copy.cover}</option>
          <option value="image-blur">{copy.blur}</option>
          <option value="image-palette">{copy.palette}</option>
        </SelectField>
      </FieldLabel>

      {settings.appBackground.mode === "solid" ? (
        <FieldLabel label={copy.solid}>
          <TextInput
            type="color"
            value={settings.appBackground.solidColor}
            onChange={(event) => update({ solidColor: event.target.value })}
          />
        </FieldLabel>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void chooseImage(file);
          }
          event.currentTarget.value = "";
        }}
      />
      <ActionButton
        disabled={busy}
        loading={busy}
        icon={<ImagePlus className="h-4 w-4" />}
        onClick={() => (getLyricsCardDesktopApi() ? void chooseImage() : inputRef.current?.click())}
      >
        {copy.chooseImage}
      </ActionButton>

      <FieldLabel label={copy.overlay} hint={`${Math.round(settings.appBackground.overlayOpacity * 100)}%`}>
        <TextInput
          type="range"
          min="0"
          max="0.9"
          step="0.02"
          value={settings.appBackground.overlayOpacity}
          onChange={(event) => update({ overlayOpacity: Number(event.target.value) })}
        />
      </FieldLabel>

      {settings.appBackground.mode === "image-blur" ? (
        <FieldLabel label={copy.blurAmount} hint={`${settings.appBackground.blurAmount}px`}>
          <TextInput
            type="range"
            min="0"
            max="80"
            value={settings.appBackground.blurAmount}
            onChange={(event) => update({ blurAmount: Number(event.target.value) })}
          />
        </FieldLabel>
      ) : null}

      {message ? <p role="status" className="status-info rounded-lg border px-3 py-2 text-sm">{message}</p> : null}

      <ActionButton size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
        {copy.resetBackground}
      </ActionButton>
    </section>
  );
}
