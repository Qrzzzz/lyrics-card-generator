"use client";

import { GeneratedWatermark } from "@/components/preview/GeneratedWatermark";
import { PlatformBadge } from "@/components/preview/PlatformBadge";
import { SharedBy } from "@/components/preview/SharedBy";
import type { SongSource } from "@/lib/types";

export function CardFooter({
  showPlatformLogo,
  platformSource,
  showGeneratedWatermark,
  showSharedBy,
  sharedByText,
  textColor
}: {
  showPlatformLogo: boolean;
  platformSource: SongSource;
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  textColor: string;
}) {
  const hasPlatform = showPlatformLogo && platformSource !== "unknown";
  const hasGeneratedWatermark = showGeneratedWatermark;
  const trimmedSharedBy = sharedByText.trim();
  const hasSharedBy = showSharedBy && trimmedSharedBy.length > 0;
  const hasTopFooterRow = hasPlatform || hasSharedBy;
  const hasFooter = hasTopFooterRow || hasGeneratedWatermark;

  if (!hasFooter) {
    return null;
  }

  return (
    <footer className="mt-auto flex shrink-0 flex-col gap-5">
      {hasTopFooterRow ? (
        <div className="grid grid-cols-2 items-end">
          <div className="justify-self-start">
            {hasPlatform ? <PlatformBadge source={platformSource} /> : null}
          </div>
          <div className="justify-self-end">
            {hasSharedBy ? <SharedBy text={trimmedSharedBy} color={textColor} /> : null}
          </div>
        </div>
      ) : null}

      {hasGeneratedWatermark ? <GeneratedWatermark color={textColor} /> : null}
    </footer>
  );
}
