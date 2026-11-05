/** Shared design contract for the shipping card and the editable design demo. */
export const INSTRUMENTAL_CARD_SIZE = { width: 1080, height: 1512 } as const;
export const INSTRUMENTAL_TYPOGRAPHY = {
  artistSize: 60, albumSize: 44, sharedBySize: 36, projectSize: 32, footerGap: 14
} as const;

export function getInstrumentalDesign(width: number, height: number) {
  const scale = width / 1080;
  return {
    inset: 64 * scale,
    titleSize: width / 10,
    artistSize: INSTRUMENTAL_TYPOGRAPHY.artistSize * scale,
    albumSize: INSTRUMENTAL_TYPOGRAPHY.albumSize * scale,
    sharedBySize: INSTRUMENTAL_TYPOGRAPHY.sharedBySize * scale,
    projectSize: INSTRUMENTAL_TYPOGRAPHY.projectSize * scale,
    footerGap: INSTRUMENTAL_TYPOGRAPHY.footerGap * scale,
    infoTop: width * 0.75,
    infoBottom: Math.min(width * 1.24, height - 112 * scale),
    footerBottom: 64 * scale,
    clearFraction: 0.88,
    extensionFraction: 0.18,
    edgeFraction: 0.10,
    blurRadius: width * 0.08
  };
}
