import { landscapeLayoutConfig } from "@/lib/card-layout-config";
import { LANDSCAPE_FRAME_INSET } from "@/lib/frame-layout";

export type LandscapeSlots = {
  safe: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  cover: {
    left: number;
    top: number;
    size: number;
  };
  songInfo: {
    left: number;
    top: number;
    width: number;
  };
  lyrics: {
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  };
  instrumental: {
    left: number;
    top: number;
    width: number;
  };
  footerTop: {
    left: number;
    right: number;
    bottom: number;
  };
  generatedWatermark: {
    bottom: number;
    width: number;
  };
};

export function getLandscapeSlots(
  width: number,
  height: number,
  options: {
    showCover?: boolean;
    allowTwoLineTitle?: boolean;
    showSongInfo?: boolean;
    frameEnabled?: boolean;
    frameInset?: number;
  } = {}
): LandscapeSlots {
  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const frameInset = options.frameInset ?? LANDSCAPE_FRAME_INSET;
  const frameInsetX = options.frameEnabled ? frameInset * scaleX : 0;
  const frameInsetY = options.frameEnabled ? frameInset * scaleY : 0;
  const layoutWidth = Math.max(1, width - frameInsetX * 2);
  const layoutHeight = Math.max(1, height - frameInsetY * 2);

  return getLandscapeSlotsForBounds(layoutWidth, layoutHeight, frameInsetX, frameInsetY, {
    showCover: options.showCover,
    allowTwoLineTitle: options.allowTwoLineTitle,
    showSongInfo: options.showSongInfo
  });
}

function getLandscapeSlotsForBounds(
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  options: {
    showCover?: boolean;
    allowTwoLineTitle?: boolean;
    showSongInfo?: boolean;
  }
): LandscapeSlots {
  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const s = Math.min(scaleX, scaleY);
  const config = landscapeLayoutConfig;
  const showCover = options.showCover ?? true;
  const contentLeft = showCover ? config.songInfo.x * scaleX : 220 * scaleX;
  const contentWidth = showCover ? config.songInfo.width * scaleX : Math.max(520 * scaleX, width - 440 * scaleX);
  const lyricTopOffset = options.allowTwoLineTitle ? 36 * scaleY : 0;
  const hiddenSongInfoOffset = options.showSongInfo === false ? -54 * scaleY : 0;
  const lyricsTop = config.lyrics.y * scaleY + lyricTopOffset + hiddenSongInfoOffset;
  const footerReserved = 150 * scaleY;
  const dynamicLyricHeight = height - lyricsTop - footerReserved;
  const lyricMaxHeight = Math.max(
    260 * scaleY,
    Math.min(dynamicLyricHeight, height - lyricsTop - 72 * scaleY)
  );

  return {
    safe: {
      left: offsetX + 128 * scaleX,
      right: offsetX + 128 * scaleX,
      top: offsetY + 96 * scaleY,
      bottom: offsetY + 72 * scaleY
    },
    cover: {
      left: offsetX + config.cover.x * scaleX,
      top: offsetY + config.cover.y * scaleY,
      size: config.cover.size * s
    },
    songInfo: {
      left: offsetX + contentLeft,
      top: offsetY + config.songInfo.y * scaleY,
      width: contentWidth
    },
    lyrics: {
      left: offsetX + contentLeft,
      top: offsetY + lyricsTop,
      width: showCover ? config.lyrics.width * scaleX : contentWidth,
      maxHeight: lyricMaxHeight
    },
    instrumental: {
      left: offsetX + (showCover ? config.songInfo.x * scaleX : 360 * scaleX),
      top: offsetY + 300 * scaleY,
      width: showCover ? config.songInfo.width * scaleX : Math.max(720 * scaleX, width - 720 * scaleX)
    },
    footerTop: {
      left: offsetX + config.footer.sideInset * scaleX,
      right: offsetX + config.footer.sideInset * scaleX,
      bottom: offsetY + config.footer.topRowBottom * scaleY
    },
    generatedWatermark: {
      bottom: offsetY + config.footer.generatedBottom * scaleY,
      width: Math.min(config.footer.generatedWidth * scaleX, width * 0.62)
    }
  };
}
