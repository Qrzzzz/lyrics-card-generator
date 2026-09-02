"use client";

import { ProjectSignature } from "@/components/preview/ProjectSignature";
import { PlatformBadge } from "@/components/preview/PlatformBadge";
import type { SongSource } from "@/lib/types";
import { withAlpha } from "@/lib/palette-background";

export function hasLandscapeAccessories(input: {
  showPlatformBadge: boolean;
  source: SongSource;
  showSharedBy: boolean;
  sharedByText: string;
  showGeneratedWatermark: boolean;
}) {
  return Boolean(
    (input.showPlatformBadge && input.source !== "unknown") ||
    (input.showSharedBy && input.sharedByText.trim()) ||
    input.showGeneratedWatermark
  );
}

export function LandscapeAccessories({
  source,
  showPlatformBadge,
  showSharedBy,
  sharedByText,
  showGeneratedWatermark,
  textColor,
  scale = 1
}: {
  source: SongSource;
  showPlatformBadge: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  showGeneratedWatermark: boolean;
  textColor: string;
  scale?: number;
}) {
  const showPlatform = showPlatformBadge && source !== "unknown";
  const sharedBy = showSharedBy ? sharedByText.trim() : "";
  if (!showPlatform && !sharedBy && !showGeneratedWatermark) return null;

  return (
    <footer data-landscape-accessories style={{ color: textColor }}>
      {showPlatform || sharedBy ? (
        <div className="flex items-end justify-between" style={{ minHeight: 52 * scale, gap: 20 * scale }}>
          <div>
            {showPlatform ? <PlatformBadge source={source} size="large" scale={scale} /> : null}
          </div>
          {sharedBy ? (
            <p
              className="line-clamp-3 text-right font-semibold"
              style={{
                maxWidth: 350 * scale,
                color: withAlpha(textColor, 0.82),
                fontSize: 20 * scale,
                lineHeight: 1.28
              }}
            >
              {sharedBy}
            </p>
          ) : null}
        </div>
      ) : null}
      {showGeneratedWatermark ? (
        <div style={{ marginTop: (showPlatform || sharedBy ? 16 : 0) * scale }}>
          <ProjectSignature color={textColor} variant="landscape" scale={scale} />
        </div>
      ) : null}
    </footer>
  );
}
