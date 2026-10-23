"use client";
import { FieldLabel, SelectField } from "@/components/ui/controls";
import { productivityCopy } from "@/lib/editor-productivity-copy";
import type { UiTextSize } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
export function InterfaceTextSize({ locale, value, onChange }: { locale: Locale; value: UiTextSize; onChange: (value: UiTextSize) => void }) {
  const copy = productivityCopy[locale];
  return <FieldLabel label={copy.uiSize}>
    <SelectField data-testid="interface-text-size" aria-label={copy.uiSize} value={value}
      onChange={(event) => onChange(event.target.value as UiTextSize)}>
      {(["standard", "large", "extra-large"] as const).map((id, i) => <option key={id} value={id}>{copy.sizes[i]}</option>)}
    </SelectField>
  </FieldLabel>;
}
