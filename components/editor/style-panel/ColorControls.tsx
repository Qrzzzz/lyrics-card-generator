"use client";

import { Input, Select, SettingRow } from "@/components/ui/controls";
import { TEXT_COLOR_PRESETS } from "@/lib/color-analysis";
import type { createT, MessageKey } from "@/lib/i18n";
import type { CardStyle, TextColorMode, TextColorPreset } from "@/lib/types";

const TEXT_PRESET_LABEL_KEYS: Record<TextColorPreset, MessageKey> = {
  white: "pureWhite",
  black: "pureBlack",
  warmWhite: "warmWhite",
  cream: "cream",
  charcoal: "charcoal",
  softBlue: "softBlue",
  softGold: "softGold"
};

type ColorControlsProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  t: ReturnType<typeof createT>;
};

export function ColorControls({ style, onStyleChange, t }: ColorControlsProps) {
  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  return (
    <div className="grid gap-0">
      <SettingRow label={t("textColor")}>
        <Select
          value={style.textColorMode}
          onChange={(event) => update("textColorMode", event.target.value as TextColorMode)}
        >
          <option value="auto">{t("auto")}</option>
          <option value="preset">{t("preset")}</option>
          <option value="custom">{t("custom")}</option>
        </Select>
      </SettingRow>
      <SettingRow label={t("preset")}>
        <Select
          value={style.textColorPreset}
          disabled={style.textColorMode !== "preset"}
          onChange={(event) => update("textColorPreset", event.target.value as TextColorPreset)}
        >
          {Object.keys(TEXT_COLOR_PRESETS).map((value) => (
            <option key={value} value={value}>
              {t(TEXT_PRESET_LABEL_KEYS[value as TextColorPreset])}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow label={t("custom")} description={style.resolvedTextColor}>
        <Input
          type="color"
          value={style.customTextColor}
          disabled={style.textColorMode !== "custom"}
          onInput={(event) => update("customTextColor", event.currentTarget.value)}
          onChange={(event) => update("customTextColor", event.target.value)}
          className="h-11 p-1"
        />
      </SettingRow>
    </div>
  );
}
