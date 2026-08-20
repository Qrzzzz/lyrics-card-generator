export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type OklabColor = {
  l: number;
  a: number;
  b: number;
};

export type OklchColor = {
  l: number;
  c: number;
  h: number;
};

export function srgbChannelToLinear(channel: number) {
  const value = clamp01(channel / 255);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(channel: number) {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return clamp01(value) * 255;
}

export function rgbToOklab({ r, g, b }: RgbColor): OklabColor {
  const red = srgbChannelToLinear(r);
  const green = srgbChannelToLinear(g);
  const blue = srgbChannelToLinear(b);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

export function oklabToRgb({ l, a, b }: OklabColor): RgbColor {
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const lLinear = lRoot ** 3;
  const mLinear = mRoot ** 3;
  const sLinear = sRoot ** 3;

  return {
    r: linearChannelToSrgb(4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear),
    g: linearChannelToSrgb(-1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear),
    b: linearChannelToSrgb(-0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear)
  };
}

export function oklabToOklch({ l, a, b }: OklabColor): OklchColor {
  const c = Math.hypot(a, b);
  return {
    l,
    c,
    h: c < 1e-7 ? 0 : (Math.atan2(b, a) * 180) / Math.PI + (b < 0 ? 360 : 0)
  };
}

export function oklchToOklab({ l, c, h }: OklchColor): OklabColor {
  const radians = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function oklabDistance(first: OklabColor, second: OklabColor) {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

export function mixOklab(first: RgbColor, second: RgbColor, amount: number): RgbColor {
  const from = rgbToOklab(first);
  const to = rgbToOklab(second);
  const weight = clamp01(amount);
  return oklabToRgb({
    l: from.l + (to.l - from.l) * weight,
    a: from.a + (to.a - from.a) * weight,
    b: from.b + (to.b - from.b) * weight
  });
}

/** Returns linear-light WCAG relative luminance, not gamma-encoded luma. */
export function relativeLuminanceLinear({ r, g, b }: RgbColor) {
  return (
    0.2126 * srgbChannelToLinear(r)
    + 0.7152 * srgbChannelToLinear(g)
    + 0.0722 * srgbChannelToLinear(b)
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

