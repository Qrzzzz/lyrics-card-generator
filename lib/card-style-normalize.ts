import { PRESET_CARD_SIZES } from "@/lib/card-size";
import type { CardStyle } from "@/lib/types";

export const FIXED_COVER_CROP_SCALE = 1;
export const FIXED_WHITE_TEXT_COLOR = "#FFFFFF";

export function normalizeCardStyle(style: CardStyle): CardStyle {
  const normalizedStyle: CardStyle =
    style.textColorMode === "custom"
      ? {
          ...style,
          coverCropScale: FIXED_COVER_CROP_SCALE,
          resolvedTextColor: style.customTextColor
        }
      : {
          ...style,
          coverCropScale: FIXED_COVER_CROP_SCALE,
          textColorMode: "preset",
          textColorPreset: "white",
          resolvedTextColor: FIXED_WHITE_TEXT_COLOR
        };

  return normalizeInstrumentalLayout(normalizedStyle);
}

export function normalizeInstrumentalLayout(style: CardStyle): CardStyle {
  if (style.contentMode !== "instrumental") {
    return style;
  }

  const squareSize = PRESET_CARD_SIZES["1:1"];

  return {
    ...style,
    layoutMode: "portrait",
    ratio: "1:1",
    width: squareSize.width,
    height: squareSize.height,
    autoHeight: false,
    translationEnabled: false,
    translationText: ""
  };
}
