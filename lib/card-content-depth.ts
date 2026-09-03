export const CARD_ARTWORK_DROP_SHADOW = "drop-shadow(0 8px 16px rgba(0,0,0,0.16))";
export const CARD_ARTWORK_BOX_SHADOW = "0 10px 24px rgba(0,0,0,0.16)";

const LIGHT_TEXT_SHADOW = "0 2px 8px rgba(0,0,0,0.20)";
const DARK_TEXT_SHADOW = "0 1px 4px rgba(255,255,255,0.12)";

export function resolveCardContentTextShadow(textColor: string) {
  return isDarkColor(textColor) ? DARK_TEXT_SHADOW : LIGHT_TEXT_SHADOW;
}

function isDarkColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return false;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < 0.42;
}
