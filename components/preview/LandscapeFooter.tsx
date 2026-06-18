"use client";

import { GeneratedWatermark } from "@/components/preview/GeneratedWatermark";
import { PlatformBadge } from "@/components/preview/PlatformBadge";
import { SharedBy } from "@/components/preview/SharedBy";
import type { Rect } from "@/lib/card-layout-engine";
import type { SongSource } from "@/lib/types";

export function LandscapeFooter({
  rect,
  showPlatformLogo,
  platformSource,
  showGeneratedWatermark,
  showSharedBy,
  sharedByText,
  textColor
}: {
  rect?: Rect;
  showPlatformLogo: boolean;
  platformSource: SongSource;
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  textColor: string;
}) {
  const hasPlatform = showPlatformLogo && platformSource !== "unknown";
  const trimmedSharedBy = sharedByText.trim();
  const hasSharedBy = showSharedBy && trimmedSharedBy.length > 0;
  const hasGenerated = showGeneratedWatermark;
  const hasTopRow = hasPlatform || hasSharedBy;
  const hasFooter = hasTopRow || hasGenerated;

  if (!hasFooter) {
    return null;
  }

  if (!rect) {
    return null;
  }

  return (
    <footer
      data-card-footer
      className="absolute z-20"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        color: textColor
      }}
    >
      {hasTopRow ? (
        <div className="absolute inset-x-0 top-0 flex items-end justify-between">
          <div>{hasPlatform ? <PlatformBadge source={platformSource} size="large" /> : null}</div>
          <div>{hasSharedBy ? <SharedBy text={trimmedSharedBy} color={textColor} variant="landscape" /> : null}</div>
        </div>
      ) : null}

      {hasGenerated ? (
        <div
          className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2"
          style={{
            width: Math.min(760, rect.width * 0.62)
          }}
        >
          <GeneratedWatermark color={textColor} variant="landscape" />
        </div>
      ) : null}
    </footer>
  );
}
