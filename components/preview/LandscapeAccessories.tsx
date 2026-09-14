"use client";

import { CardFooter, type CardFooterProps } from "@/components/preview/CardFooter";

export function hasLandscapeAccessories(input: Pick<CardFooterProps, "showSharedBy" | "sharedByText" | "showGeneratedWatermark">) {
  return Boolean((input.showSharedBy && input.sharedByText.trim()) || input.showGeneratedWatermark);
}

export function LandscapeAccessories(props: CardFooterProps) {
  return <CardFooter {...props} variant="landscape" />;
}
