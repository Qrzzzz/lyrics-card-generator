function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function getContrastRatio(first: string, second: string) {
  const luminance = (input: string) => {
    const hex = input.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((offset) => channel(Number.parseInt(hex.slice(offset, offset + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function resolveReadableTextColor(background: string, preferred?: string) {
  const light = "#FFFFFF";
  const dark = "#191612";
  if (preferred && getContrastRatio(background, preferred) >= 4.5) return preferred;
  return getContrastRatio(background, dark) >= getContrastRatio(background, light) ? dark : light;
}

export function resolveReadableTextTokens(background: string, preferred?: string) {
  const primary = resolveReadableTextColor(background, preferred);
  const isDarkText = getContrastRatio(primary, "#FFFFFF") >= getContrastRatio(primary, "#191612");

  return isDarkText
    ? {
        primary,
        fg: "25 22 18",
        muted: "71 85 105",
        subtle: "71 85 105 / 0.76"
      }
    : {
        primary,
        fg: "255 255 255",
        muted: "255 255 255 / 0.72",
        subtle: "255 255 255 / 0.52"
      };
}
