import { PRESET_CARD_SIZES } from "@/lib/card-size";
import type { CardStyle } from "@/lib/types";

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
