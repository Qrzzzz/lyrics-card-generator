export function getReadableForegroundColor(backgroundColor: string) {
  const rgb = parseColor(backgroundColor);

  if (!rgb) {
    return "#FFFFFF";
  }

  const whiteContrast = contrastRatio(rgb, [255, 255, 255]);
  const darkContrast = contrastRatio(rgb, [25, 22, 18]);

  return darkContrast >= whiteContrast ? "#191612" : "#FFFFFF";
}

function parseColor(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map((char) => `${char}${char}`).join("")
      : hexMatch[1];

    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16)
    ];
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);

  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch[1].split(",").slice(0, 3).map((part) => Number.parseFloat(part.trim()));

  if (channels.some((channel) => Number.isNaN(channel))) {
    return null;
  }

  return channels.map((channel) => Math.min(255, Math.max(0, Math.round(channel)))) as [number, number, number];
}

function contrastRatio(first: [number, number, number], second: [number, number, number]) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
