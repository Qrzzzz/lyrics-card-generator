import type { ExtractedPalette } from "@/lib/types";

export const DEFAULT_PALETTE: ExtractedPalette = {
  colors: ["#7C3AED", "#2563EB", "#F97316", "#111827", "#F8F4EA", "#64748B"],
  primary: "#7C3AED",
  secondary: "#2563EB",
  accent: "#F97316",
  dark: "#111827",
  light: "#F8F4EA",
  muted: "#64748B",
  averageLuminance: 0.35,
  averageSaturation: 0.58,
  hueVariance: 0.32,
  isLightCover: false,
  kind: "colorful"
};

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type HslColor = {
  h: number;
  s: number;
  l: number;
};

export function resolveAutoTextColor() {
  return "#F8F4EA";
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

export function rgbToHex({ r, g, b }: RgbColor) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return { h: hue * 60, s: saturation, l: lightness };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255
  };
}

export function adjustLightness(color: string, lightness: number, saturationScale = 1) {
  const hsl = rgbToHsl(hexToRgb(color));
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: clamp01(hsl.s * saturationScale),
      l: clamp01(lightness)
    })
  );
}

export function scaleSaturation(color: string, amount: number) {
  const hsl = rgbToHsl(hexToRgb(color));
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: clamp01(hsl.s * amount),
      l: hsl.l
    })
  );
}

export function relativeLuminance(color: string | RgbColor) {
  const rgb = typeof color === "string" ? hexToRgb(color) : color;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

export function mixColors(color: string, target: string, amount: number) {
  const from = hexToRgb(color);
  const to = hexToRgb(target);
  const weight = clamp01(amount);

  return rgbToHex({
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight
  });
}

export function withAlpha(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

export function normalizeHex(hex: string) {
  const trimmed = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
  }

  return "#111827";
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function toHex(value: number) {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0").toUpperCase();
}
