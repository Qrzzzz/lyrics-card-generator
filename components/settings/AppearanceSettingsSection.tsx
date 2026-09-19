"use client";

import { SettingsGroup } from "@/components/settings/SettingsLayout";
import { ColorSwatches, CustomColorInput } from "@/components/ui/ColorPicker";
import { useEffect, useState } from "react";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";
import { ActionButton, FieldLabel, SegmentedControl, TextInput, ToggleRow } from "@/components/ui/controls";
import { normalizeHexColor, UI_ACCENT_PRESETS } from "@/lib/settings/accent";
import { validateUiFontFamily } from "@/lib/settings/font-family";
import type { UiAccentMode, UiAccentPresetId, UiThemeMode, UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

const THEME_MODE_OPTIONS: Array<{ value: UiThemeMode; copyKey: "albumDynamic" | "dark" | "light" }> = [
  { value: "album-dynamic", copyKey: "albumDynamic" },
  { value: "dark", copyKey: "dark" },
  { value: "light", copyKey: "light" }
];

const ACCENT_MODE_OPTIONS: Array<{ value: UiAccentMode; copyKey: "accentAlbumDynamic" | "accentPreset" | "accentCustom" }> = [
  { value: "album-dynamic", copyKey: "accentAlbumDynamic" },
  { value: "preset", copyKey: "accentPreset" },
  { value: "custom", copyKey: "accentCustom" }
];

const ACCENT_PRESET_OPTIONS: Array<{ id: UiAccentPresetId; copyKey: "accentRed" | "accentOrange" | "accentYellow" | "accentGreen" | "accentBlue" | "accentPurple" }> = [
  { id: "red", copyKey: "accentRed" },
  { id: "orange", copyKey: "accentOrange" },
  { id: "yellow", copyKey: "accentYellow" },
  { id: "green", copyKey: "accentGreen" },
  { id: "blue", copyKey: "accentBlue" },
  { id: "purple", copyKey: "accentPurple" }
];

export function AppearanceSettingsSection({
  settings,
  copy,
  onChange
}: {
  settings: UserSettings;
  copy: typeof settingsCopy[Locale];
  onChange: (settings: UserSettings) => void;
}) {
  recordRenderBoundary("SettingsAppearance");
  const [uiFontInput, setUiFontInput] = useState(settings.uiFontFamily);
  const acrylicDisabled = settings.uiThemeMode === "album-dynamic";
  const uiFontValidation = validateUiFontFamily(uiFontInput);

  useEffect(() => {
    setUiFontInput(settings.uiFontFamily);
  }, [settings.uiFontFamily]);

  function updateThemeMode(uiThemeMode: UiThemeMode) {
    // Album-dynamic composition and acrylic material are mutually exclusive.
    onChange({
      ...settings,
      uiThemeMode,
      uiAcrylicEnabled: uiThemeMode === "album-dynamic" ? false : settings.uiAcrylicEnabled
    });
  }

  function updateAccentMode(uiAccentMode: UiAccentMode) {
    onChange({
      ...settings,
      uiAccentMode,
      uiCustomAccentColor: normalizeHexColor(settings.uiCustomAccentColor, UI_ACCENT_PRESETS.purple)
    });
  }

  return (
    <section className="grid gap-5">
      <SettingsGroup title={copy.themeAndMaterial}>
        <div className="editor-settings-field">
          <FieldLabel label={copy.theme}>
            <SegmentedControl<UiThemeMode>
              value={settings.uiThemeMode}
              ariaLabel={copy.theme}
              onChange={updateThemeMode}
              columns={3}
              options={THEME_MODE_OPTIONS.map((option) => ({
                value: option.value,
                label: copy[option.copyKey]
              }))}
            />
          </FieldLabel>

          <ToggleRow
            label={copy.acrylicEffect}
            description={acrylicDisabled ? copy.acrylicAlbumDisabled : copy.acrylicSupportNote}
            checked={!acrylicDisabled && settings.uiAcrylicEnabled}
            disabled={acrylicDisabled}
            onChange={(checked) => onChange({ ...settings, uiAcrylicEnabled: checked })}
          />
        </div>

      </SettingsGroup>
      <SettingsGroup title={copy.accentColor}>
        <FieldLabel label={copy.accentColor}>
          <div className="grid gap-3">
            <SegmentedControl<UiAccentMode>
              value={settings.uiAccentMode}
              ariaLabel={copy.accentColor}
              onChange={updateAccentMode}
              columns={3}
              options={ACCENT_MODE_OPTIONS.map((option) => ({
                value: option.value,
                label: copy[option.copyKey]
              }))}
            />

            {settings.uiAccentMode === "preset" ? (
              <ColorSwatches value={settings.uiAccentPreset} label={copy.accentPreset}
                options={ACCENT_PRESET_OPTIONS.map((option) => ({ value: option.id, color: UI_ACCENT_PRESETS[option.id], label: copy[option.copyKey] }))}
                onChange={(uiAccentPreset) => onChange({ ...settings, uiAccentMode: "preset", uiAccentPreset })} />
            ) : null}
            {settings.uiAccentMode === "custom" ? (
              <CustomColorInput value={settings.uiCustomAccentColor} label={copy.accentCustom}
                invalidMessage={copy.accentInvalid} placeholder={copy.accentCustomPlaceholder} testId="custom-accent-input"
                onChange={(uiCustomAccentColor) => onChange({ ...settings, uiAccentMode: "custom", uiCustomAccentColor })} />
            ) : null}
          </div>
        </FieldLabel>

      </SettingsGroup>
      <SettingsGroup title={copy.uiFont}>
        <div className="editor-settings-field">
          <FieldLabel
            label={copy.uiFont}
            hint={copy.defaultFont}
            description={copy.uiFontDescription}
            error={!uiFontValidation.valid ? copy.uiFontInvalid : undefined}
          >
            <TextInput
              data-testid="ui-font-family-input"
              value={uiFontInput}
              aria-invalid={!uiFontValidation.valid}
              onChange={(event) => {
                const value = event.target.value;
                setUiFontInput(value);
                const validation = validateUiFontFamily(value);
                if (validation.valid) onChange({ ...settings, uiFontFamily: validation.value });
              }}
              placeholder="Segoe UI, sans-serif"
            />
          </FieldLabel>
          <ActionButton
            variant="default"
            data-testid="restore-system-font"
            onClick={() => {
              setUiFontInput("");
              onChange({ ...settings, uiFontFamily: "" });
            }}
          >
            {copy.restoreSystemFont}
          </ActionButton>
        </div>

      </SettingsGroup>
      <SettingsGroup title={copy.interactionEffects}>
        <ToggleRow
          label={copy.spark}
          description={copy.sparkDescription}
          checked={settings.sparkCursorEnabled}
          onChange={(sparkCursorEnabled) => onChange({ ...settings, sparkCursorEnabled })}
        />
      </SettingsGroup>
    </section>
  );
}
