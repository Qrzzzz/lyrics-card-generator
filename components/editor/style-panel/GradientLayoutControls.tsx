"use client";

import { useEffect, useId, useState } from "react";
import { ActionButton, FieldLabel, TextInput } from "@/components/ui/controls";
import { MAX_GRADIENT_LAYOUT_SEED, nextGradientLayoutSeed, normalizeGradientLayoutSeed } from "@/lib/gradient-layout";
import type { Locale } from "@/lib/types";

const copy: Record<Locale, { label: string; shuffle: string; reset: string; hint: string; invalid: string }> = {
  zh: { label: "布局种子", shuffle: "随机生成新背景", reset: "恢复默认布局", hint: "点击按钮使用全新的随机种子，改变色块位置并保留封面配色。相同种子可复现布局，0 为默认。", invalid: "请输入 0–100000 之间的整数。" },
  "zh-TW": { label: "佈局種子", shuffle: "隨機產生新背景", reset: "恢復預設佈局", hint: "點擊按鈕使用全新的隨機種子，改變色塊位置並保留封面配色。相同種子可重現佈局，0 為預設。", invalid: "請輸入 0–100000 之間的整數。" },
  en: { label: "Layout seed", shuffle: "Generate random background", reset: "Reset layout", hint: "Use a new random seed to move the color fields while keeping the cover palette. The same seed reproduces the layout; 0 is the default.", invalid: "Enter an integer from 0 to 100000." },
  fr: { label: "Graine de disposition", shuffle: "Générer un fond aléatoire", reset: "Rétablir la disposition", hint: "Utilisez une nouvelle graine aléatoire pour déplacer les zones de couleur en conservant la palette. Une même graine reproduit la disposition ; 0 est la valeur par défaut.", invalid: "Saisissez un entier entre 0 et 100000." },
  ja: { label: "レイアウトシード", shuffle: "ランダムな背景を生成", reset: "標準の配置に戻す", hint: "新しいランダムシードで、ジャケットの配色を保ちながら色の領域を移動します。同じシードで配置を再現でき、0 は標準です。", invalid: "0～100000 の整数を入力してください。" },
  es: { label: "Semilla de distribución", shuffle: "Generar fondo aleatorio", reset: "Restablecer distribución", hint: "Usa una nueva semilla aleatoria para mover las zonas de color y conservar la paleta. La misma semilla reproduce la distribución; 0 es el valor predeterminado.", invalid: "Introduce un entero de 0 a 100000." }
};

export function GradientLayoutControls({ seed, onChange, locale }: {
  seed?: number; onChange: (seed: number) => void; locale: Locale;
}) {
  const value = normalizeGradientLayoutSeed(seed);
  const [draft, setDraft] = useState(String(value));
  const hintId = useId();
  const errorId = useId();
  const c = copy[locale];
  const valid = /^\d{1,6}$/.test(draft) && Number(draft) <= MAX_GRADIENT_LAYOUT_SEED;
  useEffect(() => { setDraft(String(value)); }, [value]);
  function choose(next: number) { setDraft(String(next)); onChange(next); }
  return <div className="grid gap-3" data-gradient-controls>
    <ActionButton variant="primary" className="justify-self-start" data-testid="gradient-layout-shuffle"
      aria-describedby={hintId} onClick={() => choose(nextGradientLayoutSeed(value))}>{c.shuffle}</ActionButton>
    <FieldLabel label={c.label}>
      <TextInput data-testid="gradient-layout-seed" aria-label={c.label} inputMode="numeric"
        value={draft} maxLength={6} autoComplete="off" spellCheck={false}
        aria-invalid={!valid} aria-describedby={valid ? hintId : `${hintId} ${errorId}`}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (/^\d{1,6}$/.test(next) && Number(next) <= MAX_GRADIENT_LAYOUT_SEED) onChange(Number(next));
        }}
        onBlur={() => { if (valid) setDraft(String(value)); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setDraft(String(value)); } }} />
    </FieldLabel>
    <div className="flex flex-wrap gap-2">
      <ActionButton data-testid="gradient-layout-reset" onClick={() => choose(0)}>{c.reset}</ActionButton>
    </div>
    <p id={hintId} className="app-text-subtle text-xs">{c.hint}</p>
    {!valid ? <p id={errorId} className="app-text-primary text-xs" role="status">{c.invalid}</p> : null}
  </div>;
}
