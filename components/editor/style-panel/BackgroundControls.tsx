"use client";

import { useState } from "react";
import { Input, SegmentedControl } from "@/components/ui/controls";
import { resolveSolidColor, solidCandidates } from "@/lib/solid-background";
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
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  function choose(value: string) {
    if (/^#[\da-f]{6}$/i.test(value)) onStyleChange({ ...style, solidColor: value.toUpperCase(), solidColorSource: "user" });
  }
  return <SettingsGroup title={c[0]}>
    <SegmentedControl value={style.backgroundMode === "solid" ? "solid" : "palette"}
      onChange={(backgroundMode: "solid" | "palette") => onStyleChange({ ...style, backgroundMode })}
      options={[{ value: "palette", label: c[1] }, { value: "solid", label: c[2] }]} aria-label={c[0]} />
    {style.backgroundMode === "solid" ? <div className="grid gap-3" data-solid-controls>
      <p className="app-text-subtle text-xs">{c[candidates.source === "cover" ? 3 : 4]}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={c[3]}>
        {candidates.colors.map((value) => <button key={value} type="button" className="h-10 w-10 rounded-lg border border-current focus-visible:outline focus-visible:outline-2"
          aria-label={value} title={value} aria-pressed={color === value} style={{ backgroundColor: value }} onClick={() => { setHexDraft(null); choose(value); }} />)}
      </div>
      <p className="text-xs">{c[5]}: <span className="font-mono">{color}</span> · {style.solidColorSource === "user" ? c[6] : c[7]}</p>
      <div className="flex items-center gap-2">
        <Input type="color" aria-label={c[6]} value={color} className="h-11 w-16 p-1" onChange={(e) => { setHexDraft(null); choose(e.target.value); }} />
        <Input aria-label={`${c[6]} HEX`} value={hexDraft ?? color} maxLength={7} spellCheck={false}
          aria-invalid={hexDraft !== null && !/^#[\da-f]{6}$/i.test(hexDraft)}
          onChange={(e) => { setHexDraft(e.target.value); choose(e.target.value); }} onBlur={() => setHexDraft(null)} />
        <button type="button" className="app-text-subtle shrink-0 text-xs underline" onClick={() => { setHexDraft(null); onStyleChange({ ...style, solidColorSource: "auto" }); }}>{c[7]}</button>
      </div>
    </div> : null}
  </SettingsGroup>;
}
