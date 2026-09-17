"use client";

import { useState } from "react";
import { ActionButton, SegmentedControl } from "@/components/ui/controls";
import { ColorSwatches, CustomColorInput } from "@/components/ui/ColorPicker";
import { colorPickerCopy } from "@/lib/color-picker-copy";
import { resolveSolidColor, solidCandidates, SOLID_PRESETS } from "@/lib/solid-background";
import type { CardStyle, Locale } from "@/lib/types";
import { SettingsGroup } from "./SettingsLayout";

const copy: Record<Locale, string[]> = {
  zh: ["背景", "流光渐变", "极简纯色", "封面候选色", "预设色", "当前颜色", "自定义颜色", "自动推荐"],
  "zh-TW": ["背景", "流光漸層", "極簡純色", "封面候選色", "預設色", "目前顏色", "自訂顏色", "自動推薦"],
  en: ["Background", "Flowing gradient", "Solid color", "Cover colors", "Preset colors", "Current color", "Custom color", "Automatic"],
  fr: ["Fond", "Dégradé fluide", "Couleur unie", "Couleurs de la pochette", "Couleurs prédéfinies", "Couleur actuelle", "Couleur personnalisée", "Automatique"],
  ja: ["背景", "流れるグラデーション", "単色", "ジャケットの候補色", "プリセット色", "現在の色", "カスタムカラー", "自動選択"],
  es: ["Fondo", "Degradado fluido", "Color sólido", "Colores de portada", "Colores predefinidos", "Color actual", "Color personalizado", "Automático"]
};

export function BackgroundControls({ style, onStyleChange, locale }: {
  style: CardStyle; onStyleChange: (style: CardStyle) => void; locale: Locale;
}) {
  const c = copy[locale];
  const candidates = solidCandidates(style.extractedPalette);
  const color = resolveSolidColor(style);
  const detail = colorPickerCopy[locale];
  const [source, setSource] = useState<"cover" | "preset">("cover");
  const [resetKey, setResetKey] = useState(0);
  const visibleSource = candidates.source === "cover" ? source : "preset";
  const colors = visibleSource === "cover" ? candidates.colors : SOLID_PRESETS;
  function choose(value: string) {
    onStyleChange({ ...style, solidColor: value, solidColorSource: "user" });
  }
  return <SettingsGroup title={c[0]}>
    <SegmentedControl value={style.backgroundMode === "solid" ? "solid" : "palette"}
      onChange={(backgroundMode: "solid" | "palette") => onStyleChange({ ...style, backgroundMode })}
      options={[{ value: "palette", label: c[1] }, { value: "solid", label: c[2] }]} aria-label={c[0]} />
    {style.backgroundMode === "solid" ? <div className="grid gap-3" data-solid-controls>
      {candidates.source === "cover" ? <SegmentedControl value={visibleSource} onChange={setSource}
        ariaLabel={detail.source} options={[{ value: "cover", label: c[3] }, { value: "preset", label: c[4] }]} />
        : <p className="app-text-subtle text-xs">{c[4]}</p>}
      <ColorSwatches value={color} label={c[visibleSource === "cover" ? 3 : 4]}
        options={colors.map((value, index) => ({ value, color: value, label: visibleSource === "cover" ? value : detail.presets[index] }))}
        onChange={(value) => { setResetKey((key) => key + 1); choose(value); }} />
      <p className="text-xs">{c[5]}: <span className="font-mono">{color}</span> · {style.solidColorSource === "user" ? detail.manual : c[7]}</p>
      <CustomColorInput value={color} onChange={choose} label={c[6]} invalidMessage={detail.invalid}
        testId="solid-color-input" resetKey={`${resetKey}:${style.solidColorSource}`} />
      <ActionButton className="justify-self-start" onClick={() => {
        setResetKey((key) => key + 1);
        onStyleChange({ ...style, solidColorSource: "auto" });
      }}>{c[7]}</ActionButton>
    </div> : null}
  </SettingsGroup>;
}
