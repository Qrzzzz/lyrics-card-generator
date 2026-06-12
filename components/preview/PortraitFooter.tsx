"use client";

import { CardFooter } from "@/components/preview/CardFooter";
import type { SongSource } from "@/lib/types";

export function PortraitFooter({
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
  return (
    <CardFooter
      showPlatformLogo={showPlatformLogo}
      platformSource={platformSource}
      showGeneratedWatermark={showGeneratedWatermark}
      showSharedBy={showSharedBy}
      sharedByText={sharedByText}
      textColor={textColor}
    />
  );
}
