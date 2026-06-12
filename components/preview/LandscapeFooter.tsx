"use client";

import { GeneratedWatermark } from "@/components/preview/GeneratedWatermark";
import { PlatformBadge } from "@/components/preview/PlatformBadge";
import { SharedBy } from "@/components/preview/SharedBy";
import { getLandscapeSlots } from "@/lib/landscape-layout";
import type { SongSource } from "@/lib/types";

export function LandscapeFooter({
  width,
  height,
  showPlatformLogo,
  platformSource,
  showGeneratedWatermark,
  showSharedBy,
  sharedByText,
  textColor
}: {
  width: number;
  height: number;
  showPlatformLogo: boolean;
  platformSource: SongSource;
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  textColor: string;
}) {
  const slots = getLandscapeSlots(width, height);
  const hasPlatform = showPlatformLogo && platformSource !== "unknown";
  const trimmedSharedBy = sharedByText.trim();
  const hasSharedBy = showSharedBy && trimmedSharedBy.length > 0;
  const hasGenerated = showGeneratedWatermark;
  const hasTopRow = hasPlatform || hasSharedBy;
  const hasFooter = hasTopRow || hasGenerated;

  if (!hasFooter) {
    return null;
  }

  return (
    <>
      {hasTopRow ? (
        <div
          className="absolute z-20 flex items-end justify-between"
          style={{
            left: slots.footerTop.left,
            right: slots.footerTop.right,
            bottom: slots.footerTop.bottom
          }}
        >
          <div>{hasPlatform ? <PlatformBadge source={platformSource} size="large" /> : null}</div>
          <div>{hasSharedBy ? <SharedBy text={trimmedSharedBy} color={textColor} variant="landscape" /> : null}</div>
        </div>
      ) : null}

      {hasGenerated ? (
        <div
          className="absolute left-1/2 z-20 -translate-x-1/2"
          style={{
            bottom: slots.generatedWatermark.bottom,
            width: slots.generatedWatermark.width
          }}
        >
          <GeneratedWatermark color={textColor} variant="landscape" />
        </div>
      ) : null}
    </>
  );
}
