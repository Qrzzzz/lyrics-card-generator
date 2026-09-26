"use client";

import { ProjectSignature } from "@/components/preview/ProjectSignature";
import { SharedBy } from "@/components/preview/SharedBy";

export type CardFooterProps = {
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  textColor: string;
  variant?: "portrait" | "landscape";
  scale?: number;
  instrumentalAlign?: "left" | "center";
};

export function CardFooter({
  showGeneratedWatermark, showSharedBy, sharedByText, textColor,
  variant = "portrait", scale = 1, instrumentalAlign
}: CardFooterProps) {
  const sharedBy = showSharedBy ? sharedByText.trim() : "";
  if (!sharedBy && !showGeneratedWatermark) return null;

  return (
    <footer
      data-card-credits
      data-landscape-accessories={variant === "landscape" ? "" : undefined}
      className="flex w-full min-w-0 shrink-0 flex-col"
      style={{ gap: 14 * scale, fontFamily: '"Mona Sans", "Source Han Sans SC", sans-serif',
        fontKerning: "normal", fontStyle: instrumentalAlign ? "normal" : "italic", fontSynthesis: "none", paddingInline: "0.18em", boxSizing: "border-box",
        ...(instrumentalAlign ? { gap: 10 } : {}) }}
    >
      {sharedBy ? <SharedBy text={sharedBy} color={textColor} variant={variant} scale={scale} instrumentalAlign={instrumentalAlign} /> : null}
      {showGeneratedWatermark ? <ProjectSignature color={textColor} variant={variant} scale={scale} instrumentalAlign={instrumentalAlign} /> : null}
    </footer>
  );
}
