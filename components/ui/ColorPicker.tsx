"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FieldLabel, Input, TextInput } from "@/components/ui/controls";
import { getReadableForegroundColor } from "@/lib/contrast-color";
import { normalizeHexColor } from "@/lib/settings/accent";
import { cn } from "@/lib/utils";

export function ColorSwatches<T extends string>({ value, options, label, onChange }: {
  value: string;
  options: Array<{ value: T; color: string; label: string }>;
  label: string;
  onChange: (value: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  return <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" data-color-swatches>
    {options.map((option, index) => {
      const selected = option.value === value;
      return <button key={option.value} type="button" role="radio"
        ref={(node) => { refs.current[index] = node; }}
        aria-label={option.label} title={`${option.label} · ${option.color}`}
        aria-checked={selected} tabIndex={index === Math.max(0, selectedIndex) ? 0 : -1}
        onClick={() => onChange(option.value)}
        onKeyDown={(event) => {
          const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
          if (!direction && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + direction + options.length) % options.length;
          onChange(options[next].value);
          refs.current[next]?.focus();
        }}
        className={cn("control-focus grid size-11 shrink-0 place-items-center rounded-full border transition", selected
          ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))] shadow-[0_0_0_3px_var(--control-selected-bg)]"
          : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]")}
      >
        <span className="grid size-7 place-items-center rounded-full border border-black/15" style={{ backgroundColor: option.color }}>
          {selected ? <Check className="h-4 w-4" style={{ color: getReadableForegroundColor(option.color) }} aria-hidden="true" /> : null}
        </span>
      </button>;
    })}
  </div>;
}

/** Invalid drafts stay local; only complete normalized colors reach persistence. */
export function CustomColorInput({ value, onChange, label, invalidMessage, placeholder = "#123ABC", testId, resetKey }: {
  value: string;
  onChange: (color: string) => void;
  label: string;
  invalidMessage: string;
  placeholder?: string;
  testId?: string;
  resetKey?: string | number;
}) {
  const [draft, setDraft] = useState(value);
  const errorId = useId();
  useEffect(() => { setDraft(value); }, [value, resetKey]);
  const normalized = normalizeHexColor(draft, "");
  return <div className="grid gap-2" data-custom-color>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <FieldLabel label={label}>
        <TextInput data-testid={testId} aria-label={`${label} HEX`} value={draft}
          placeholder={placeholder} spellCheck={false} autoComplete="off"
          aria-invalid={!normalized} aria-describedby={!normalized ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            const color = normalizeHexColor(event.target.value, "");
            if (color) onChange(color);
          }}
          onBlur={() => { if (normalized) setDraft(normalized); }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setDraft(value); } }}
        />
      </FieldLabel>
      <Input type="color" aria-label={label} value={value} className="h-11 w-11 shrink-0 p-1"
        onChange={(event) => { const color = normalizeHexColor(event.target.value, value); setDraft(color); onChange(color); }} />
    </div>
    {!normalized ? <p id={errorId} className="app-text-primary text-xs" role="status">{invalidMessage}</p> : null}
  </div>;
}
