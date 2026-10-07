export const MAX_GRADIENT_LAYOUT_SEED = 100_000;

/** Old documents and invalid runtime values use the default composition. */
export function normalizeGradientLayoutSeed(value: number | undefined) {
  return Number.isInteger(value) && value! >= 0 && value! <= MAX_GRADIENT_LAYOUT_SEED ? value! : 0;
}

/** Randomness is requested only by a user action, never during rendering. */
export function nextGradientLayoutSeed(current: number, random = Math.random()) {
  const candidate = 1 + Math.floor(Math.max(0, Math.min(0.999999999, random)) * MAX_GRADIENT_LAYOUT_SEED);
  return candidate === current ? candidate % MAX_GRADIENT_LAYOUT_SEED + 1 : candidate;
}
