"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";
import { ActionButton, FieldLabel, SegmentedControl, TextInput, ToggleRow } from "@/components/ui/controls";
import { getReadableForegroundColor } from "@/lib/contrast-color";
import { normalizeHexColor, UI_ACCENT_PRESETS } from "@/lib/settings/accent";
import { validateUiFontFamily } from "@/lib/settings/font-family";
import type { UiAccentMode, UiAccentPresetId, UiThemeMode, UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";
import { cn } from "@/lib/utils";

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
  const [customAccentInput, setCustomAccentInput] = useState(settings.uiCustomAccentColor);
  const [uiFontInput, setUiFontInput] = useState(settings.uiFontFamily);
  const normalizedCustomAccent = normalizeHexColor(customAccentInput, "");
  const customAccentIsValid = normalizedCustomAccent !== "";
  const customAccentPreview = normalizeHexColor(customAccentInput, UI_ACCENT_PRESETS.purple);
  const acrylicDisabled = settings.uiThemeMode === "album-dynamic";
  const uiFontValidation = validateUiFontFamily(uiFontInput);

  useEffect(() => {
    setCustomAccentInput(settings.uiCustomAccentColor);
  }, [settings.uiCustomAccentColor]);

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

  function updateCustomAccent(value: string) {
    // Keep invalid text local for editing; persist only a normalized complete color.
    setCustomAccentInput(value);
    const normalized = normalizeHexColor(value, "");
    if (normalized) {
      onChange({
        ...settings,
        uiAccentMode: "custom",
        uiCustomAccentColor: normalized
      });
    }
  }

  return (
    <section className="grid gap-5">
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
            <div role="radiogroup" aria-label={copy.accentPreset} className="flex flex-wrap gap-2">
              {ACCENT_PRESET_OPTIONS.map((option) => {
                const color = UI_ACCENT_PRESETS[option.id];
                const selected = settings.uiAccentPreset === option.id;
                const checkColor = getReadableForegroundColor(color);

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-label={copy[option.copyKey]}
                    aria-checked={selected}
                    onClick={() => onChange({ ...settings, uiAccentMode: "preset", uiAccentPreset: option.id })}
                    className={cn(
                      "control-focus grid size-10 place-items-center rounded-full border transition",
                      selected
                        ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))] shadow-[0_0_0_3px_var(--control-selected-bg)]"
                        : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
                    )}
                  >
                    <span
                      className="grid size-7 place-items-center rounded-full"
                      style={{ backgroundColor: color }}
                    >
                      {selected ? <Check className="h-4 w-4 drop-shadow" style={{ color: checkColor }} aria-hidden="true" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {settings.uiAccentMode === "custom" ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <FieldLabel
                label={copy.accentCustom}
                error={!customAccentIsValid ? copy.accentInvalid : undefined}
              >
                <TextInput
                  data-testid="custom-accent-input"
                  value={customAccentInput}
                  onChange={(event) => updateCustomAccent(event.target.value)}
                  placeholder={copy.accentCustomPlaceholder}
                  aria-invalid={!customAccentIsValid}
                />
              </FieldLabel>
              <span
                className="h-11 w-11 shrink-0 rounded-lg border border-[rgb(var(--panel-border))]"
                style={{ backgroundColor: customAccentPreview }}
                aria-hidden="true"
              />
            </div>
          ) : null}
        </div>
      </FieldLabel>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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

      <ToggleRow
        label={copy.spark}
        description={copy.sparkDescription}
        checked={settings.sparkCursorEnabled}
        onChange={(sparkCursorEnabled) => onChange({ ...settings, sparkCursorEnabled })}
      />
    </section>
  );
}
