export const UI_FONT_FAMILY_MAX_LENGTH = 160;

export type UiFontFamilyValidation =
  | { valid: true; value: string }
  | { valid: false; value: "" };

/**
 * Accepts a conservative CSS font-family list without accepting arbitrary CSS.
 * The result is safe to assign as a style value and remains human-editable.
 */
export function validateUiFontFamily(input: unknown): UiFontFamilyValidation {
  if (typeof input !== "string") return { valid: false, value: "" };
  const trimmed = input.trim();
  if (!trimmed) return { valid: true, value: "" };
  if (trimmed.length > UI_FONT_FAMILY_MAX_LENGTH) return { valid: false, value: "" };
  if (/[\u0000-\u001F\u007F;{}<>\\]/u.test(trimmed)) return { valid: false, value: "" };
  if (/\b(?:url|var|expression)\s*\(/iu.test(trimmed) || /[()]/u.test(trimmed)) {
    return { valid: false, value: "" };
  }

  const families = trimmed.split(",");
  if (families.some((family) => !family.trim())) return { valid: false, value: "" };
  const normalized: string[] = [];
  for (const family of families) {
    const value = family.trim();
    const quote = value[0] === "\"" || value[0] === "'" ? value[0] : "";
    const content = quote ? value.slice(1, -1) : value;
    if (quote && value.at(-1) !== quote) return { valid: false, value: "" };
    if (!content || !/^[\p{L}\p{M}\p{N}\s_-]+$/u.test(content)) {
      return { valid: false, value: "" };
    }
    const compact = content.replace(/\s+/gu, " ").trim();
    normalized.push(quote ? `${quote}${compact}${quote}` : compact);
  }
  return { valid: true, value: normalized.join(", ") };
}

export function normalizeUiFontFamily(input: unknown) {
  const result = validateUiFontFamily(input);
  return result.valid ? result.value : "";
}
