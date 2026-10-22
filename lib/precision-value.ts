/** Numeric drafts never enter document state until the complete value is valid. */
export function parsePrecisionValue(draft: string, min: number, max: number, step: number): number | null {
  const text = draft.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max || step <= 0) return null;
  const tick = Math.round((value - min) / step);
  const normalized = Number((min + tick * step).toFixed(6));
  return Math.abs(normalized - value) <= 0.000001 ? normalized : null;
}
