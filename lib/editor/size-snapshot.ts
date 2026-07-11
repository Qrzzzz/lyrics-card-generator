import type { CardSizeSnapshot, CardStyle } from "@/lib/types";

export function sizeSnapshot(style: CardStyle): Required<CardSizeSnapshot> {
  return {
    ratio: style.ratio,
    width: style.width,
    height: style.height,
    autoHeight: style.autoHeight
  };
}
