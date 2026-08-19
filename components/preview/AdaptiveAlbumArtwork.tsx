"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import {
  getArtworkAspectRatio,
  resolveAdaptiveArtworkSize,
  type AdaptiveArtworkSize
} from "@/lib/artwork-geometry";
import type { CoverArtworkAnalysis } from "@/lib/types";
import { cn } from "@/lib/utils";

type AdaptiveAlbumArtworkProps = {
  sourceUrl?: string;
  analysis?: CoverArtworkAnalysis;
  baseSize?: number;
  maxWidth?: number;
  maxHeight?: number;
  resolvedSize?: Pick<AdaptiveArtworkSize, "width" | "height"> & Partial<AdaptiveArtworkSize>;
  borderRadius: number;
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
  dropShadow?: string;
  boxShadow?: string;
  placeholderClassName?: string;
  onError?: () => void;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  testId?: string;
  imageTestId?: string;
  crossOrigin?: boolean;
  loading?: "eager" | "lazy";
};

/** Renders artwork at its natural ratio without a square backing stage. */
export function AdaptiveAlbumArtwork({
  sourceUrl,
  analysis,
  baseSize = 196,
  maxWidth,
  maxHeight,
  resolvedSize,
  borderRadius,
  className,
  imageClassName,
  style,
  dropShadow,
  boxShadow,
  placeholderClassName = "bg-black/10",
  onError,
  onLoad,
  testId,
  imageTestId,
  crossOrigin = true,
  loading
}: AdaptiveAlbumArtworkProps) {
  const [locallyMeasuredRatio, setLocallyMeasuredRatio] = useState<number | null>(null);

  useEffect(() => {
    setLocallyMeasuredRatio(null);
  }, [sourceUrl]);

  const analyzedRatio = getArtworkAspectRatio(sourceUrl, analysis);
  const size = useMemo<AdaptiveArtworkSize>(
    () => resolvedSize
      ? {
          width: resolvedSize.width,
          height: resolvedSize.height,
          aspectRatio: resolvedSize.aspectRatio ?? analyzedRatio,
          constrained: resolvedSize.constrained ?? false
        }
      : resolveAdaptiveArtworkSize({
          baseSize,
          aspectRatio: locallyMeasuredRatio ?? analyzedRatio,
          maxWidth,
          maxHeight
        }),
    [analyzedRatio, baseSize, locallyMeasuredRatio, maxHeight, maxWidth, resolvedSize]
  );
  const hasTransparency = Boolean(
    sourceUrl &&
    analysis?.sourceUrl === sourceUrl &&
    analysis.status === "ready" &&
    analysis.hasTransparency
  );

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    if (!resolvedSize && image.naturalWidth > 0 && image.naturalHeight > 0) {
      setLocallyMeasuredRatio(image.naturalWidth / image.naturalHeight);
    }
    onLoad?.(event);
  }

  return (
    <div
      data-adaptive-artwork="true"
      data-card-album-cover="true"
      data-artwork-aspect-ratio={size.aspectRatio.toFixed(6)}
      data-artwork-constrained={size.constrained ? "true" : "false"}
      data-artwork-transparent={hasTransparency ? "true" : "false"}
      data-testid={testId}
      className={cn("relative shrink-0 overflow-hidden", className)}
      style={{
        ...style,
        width: size.width,
        height: size.height,
        borderRadius,
        filter: hasTransparency ? dropShadow : undefined,
        boxShadow: hasTransparency ? undefined : boxShadow
      }}
    >
      {sourceUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid={imageTestId}
          src={sourceUrl}
          alt=""
          crossOrigin={crossOrigin ? "anonymous" : undefined}
          loading={loading}
          onLoad={handleLoad}
          onError={onError}
          className={cn("absolute inset-0 h-full w-full object-contain", imageClassName)}
          draggable={false}
        />
      ) : (
        <div className={cn("absolute inset-0", placeholderClassName)} />
      )}
    </div>
  );
}
