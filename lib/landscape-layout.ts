import { landscapeLayoutConfig } from "@/lib/card-layout-config";

export function getLandscapeSlots(
  width: number,
  height: number,
  options: {
    showCover?: boolean;
    allowTwoLineTitle?: boolean;
    showSongInfo?: boolean;
  } = {}
) {
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
      left: 128 * scaleX,
      right: 128 * scaleX,
      top: 96 * scaleY,
      bottom: 72 * scaleY
    },
    cover: {
      left: config.cover.x * scaleX,
      top: config.cover.y * scaleY,
      size: config.cover.size * s
    },
    songInfo: {
      left: contentLeft,
      top: config.songInfo.y * scaleY,
      width: contentWidth
    },
    lyrics: {
      left: contentLeft,
      top: lyricsTop,
      width: showCover ? config.lyrics.width * scaleX : contentWidth,
      maxHeight: lyricMaxHeight
    },
    instrumental: {
      left: showCover ? config.songInfo.x * scaleX : 360 * scaleX,
      top: 300 * scaleY,
      width: showCover ? config.songInfo.width * scaleX : Math.max(720 * scaleX, width - 720 * scaleX)
    },
    footerTop: {
      left: config.footer.sideInset * scaleX,
      right: config.footer.sideInset * scaleX,
      bottom: config.footer.topRowBottom * scaleY
    },
    generatedWatermark: {
      bottom: config.footer.generatedBottom * scaleY,
      width: Math.min(config.footer.generatedWidth * scaleX, width * 0.62)
    }
  };
}
