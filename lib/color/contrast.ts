function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

type Rgb = readonly [number, number, number];

function parseHexColor(input: string): Rgb {
  const hex = input.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

function toHexColor(channels: Rgb) {
  return `#${channels.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export const LIGHT_ACRYLIC_CONTRAST_FLOOR = {
  windowBase: { color: "#F8FAFC", opacity: 0.22 },
  surfaces: {
    panel: { color: "#FFFFFF", opacity: 0.70 },
    input: { color: "#FFFFFF", opacity: 0.76 },
    button: { color: "#FFFFFF", opacity: 0.60 },
    elevated: { color: "#FAFCFF", opacity: 0.97 }
  },
  text: {
    primary: "#0F172A",
    muted: "#334155",
    subtle: "#475569"
  },
  controlBorder: { color: "#64748B", opacity: 0.86 }
} as const;

export function compositeHexColors(foreground: string, background: string, opacity: number) {
  const foregroundChannels = parseHexColor(foreground);
  const backgroundChannels = parseHexColor(background);
  const alpha = Math.min(1, Math.max(0, opacity));

  return toHexColor(
    foregroundChannels.map((value, index) => (
      value * alpha + backgroundChannels[index] * (1 - alpha)
    )) as unknown as Rgb
  );
}

export function getContrastRatio(first: string, second: string) {
  const luminance = (input: string) => {
    const [r, g, b] = parseHexColor(input).map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const LIGHT_ACRYLIC_TEXT_TOKENS = {
  primary: LIGHT_ACRYLIC_CONTRAST_FLOOR.text.primary,
  fg: "15 23 42",
  muted: "51 65 85",
  subtle: "71 85 105"
} as const;

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
