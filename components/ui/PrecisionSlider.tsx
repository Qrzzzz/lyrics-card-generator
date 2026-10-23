"use client";
import { useEffect, useId, useState } from "react";
import { RangeSlider, TextInput } from "@/components/ui/controls";
import { parsePrecisionValue } from "@/lib/precision-value";
import { productivityCopy } from "@/lib/editor-productivity-copy";
import type { Locale } from "@/lib/types";

export function PrecisionSlider({ value, min, max, step = 1, onValueChange, locale, resetValue, unit = "", disabled = false, settingId, "aria-label": label }: {
  value: number; min: number; max: number; step?: number; onValueChange: (value: number) => void;
  locale: Locale; resetValue: number; unit?: string; disabled?: boolean; settingId?: string; "aria-label": string;
}) {
  const copy = productivityCopy[locale];
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(String(value)); setInvalid(false); }, [value, disabled]);
  const error = copy.invalid.replace("{min}", String(min)).replace("{max}", String(max)).replace("{step}", String(step));
  function commit() {
    if (disabled) return;
    const next = parsePrecisionValue(draft, min, max, step);
    setInvalid(next === null);
    if (next !== null) { setDraft(String(next)); if (next !== value) onValueChange(next); }
  }
  return <div className="grid min-w-0 gap-2" data-precision-control data-setting-target={settingId}>
    <RangeSlider aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={(event) => onValueChange(Number(event.target.value))} />
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <TextInput className="min-w-0 w-28" role="spinbutton" inputMode="decimal"
        aria-label={`${label} · ${copy.exact}`} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        aria-invalid={invalid} aria-describedby={invalid || disabled ? id : undefined}
        value={draft} disabled={disabled} onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={commit} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); setInvalid(false); }
          if (event.key === "Enter") { event.preventDefault(); commit(); }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const base = parsePrecisionValue(draft, min, max, step) ?? value;
            const next = Number(Math.min(max, Math.max(min, base + (event.key === "ArrowUp" ? step : -step))).toFixed(6));
            setDraft(String(next)); setInvalid(false); onValueChange(next);
          }
        }} />
      {unit ? <span className="app-text-muted text-sm">{unit}</span> : null}
      <button type="button" className="app-button control-focus rounded-md px-2 py-1 text-xs" disabled={disabled}
        aria-label={`${copy.reset} · ${label}`} onClick={() => { setDraft(String(resetValue)); setInvalid(false); onValueChange(resetValue); }}>{copy.reset}</button>
    </div>
    {invalid || disabled ? <p id={id} role={invalid ? "alert" : undefined} className="app-text-muted text-xs">{invalid ? error : copy.automatic}</p> : null}
  </div>;
}
