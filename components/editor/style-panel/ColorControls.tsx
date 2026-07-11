"use client";

import { Input, SegmentedControl, SettingRow } from "@/components/ui/controls";
import type { createT } from "@/lib/i18n";
import type { CardStyle } from "@/lib/types";

type ColorControlsProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  t: ReturnType<typeof createT>;
};

export function ColorControls({ style, onStyleChange, t }: ColorControlsProps) {
  const selectedColorMode = style.textColorMode === "custom" ? "custom" : "white";

  function selectColorMode(mode: "white" | "custom") {
    if (mode === "custom") {
      onStyleChange({
        ...style,
        textColorMode: "custom",
        resolvedTextColor: style.customTextColor
      });
      return;
    }

    onStyleChange({
      ...style,
      textColorMode: "preset",
      textColorPreset: "white",
      resolvedTextColor: "#FFFFFF"
    });
  }

  function updateCustomColor(customTextColor: string) {
    onStyleChange({
      ...style,
      textColorMode: "custom",
      customTextColor,
      resolvedTextColor: customTextColor
    });
  }

  return (
    <div className="grid gap-0">
      <SettingRow label={t("textColor")}>
        <SegmentedControl<"white" | "custom">
          value={selectedColorMode}
          onChange={selectColorMode}
          options={[
            { value: "white", label: t("pureWhite") },
            { value: "custom", label: t("custom") }
          ]}
          aria-label={t("textColor")}
        />
      </SettingRow>
      {selectedColorMode === "custom" ? (
        <SettingRow label={t("custom")} description={style.resolvedTextColor}>
          <Input
            aria-label={t("custom")}
            type="color"
            value={style.customTextColor}
            onInput={(event) => updateCustomColor(event.currentTarget.value)}
            onChange={(event) => updateCustomColor(event.target.value)}
            className="h-11 p-1"
          />
        </SettingRow>
      ) : null}
    </div>
  );
}
