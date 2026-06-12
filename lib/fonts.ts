import type { CardFont } from "@/lib/types";

export const FONT_OPTIONS: Array<{ value: CardFont; label: string; className: string }> = [
  { value: "sans-heavy", label: "Source Han Sans Heavy", className: "card-font-sans-heavy" },
  { value: "serif-heavy", label: "Source Han Serif Heavy", className: "card-font-serif-heavy" },
  { value: "system-sans", label: "System Sans", className: "card-font-system-sans" },
  { value: "system-serif", label: "System Serif", className: "card-font-system-serif" }
];

export function fontClassName(font: CardFont) {
  return FONT_OPTIONS.find((option) => option.value === font)?.className ?? "card-font-sans-heavy";
}
