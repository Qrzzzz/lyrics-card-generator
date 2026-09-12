import type { LyricSeparatorStyle } from "@/lib/lyric-separator";

/** Shared by visible cards, measurement hosts and raster export. No font glyph dependency. */
export function LyricSeparator({ style = "dot", fontSize, color }: {
  style?: LyricSeparatorStyle;
  fontSize: number;
  color: string;
}) {
  const dot = style !== "line";
  return (
    <div
      data-lyric-separator={dot ? "dot" : "line"}
      aria-hidden="true"
      style={{ height: fontSize * 0.65, display: "flex", alignItems: "center", justifyContent: "center", color }}
    >
      <span style={{
        display: "block", flexShrink: 0, backgroundColor: "currentColor", opacity: dot ? 0.48 : 0.36,
        width: fontSize * (dot ? 0.105 : 1.65), height: dot ? fontSize * 0.105 : Math.max(1, fontSize * 0.022),
        borderRadius: dot ? "50%" : 0
      }} />
    </div>
  );
}
