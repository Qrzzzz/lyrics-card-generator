import type { CSSProperties } from "react";
import { getLyricLineSpacing } from "@/lib/lyric-typography";

/** One text node per authored line also keeps width and ink measurements complete. */
export function LyricTextLines({
  lines,
  kind,
  rowIndex,
  fontSize,
  lineHeight,
  className,
  style,
  landscape = false
}: {
  lines: string[];
  kind: "lyric" | "translation";
  rowIndex: number;
  fontSize: number;
  lineHeight: number;
  className: string;
  style?: CSSProperties;
  landscape?: boolean;
}) {
  const authoredLines = lines.flatMap((line) => line.split(/\r\n?|\n/));
  const { wrapLineHeight, edgePadding } = getLyricLineSpacing(lineHeight, fontSize);
  return authoredLines.map((line, index) => (
    <p
      key={index}
      data-lyric-authored-line={kind}
      data-landscape-line={landscape ? kind : undefined}
      data-auto-width-line={kind}
      data-auto-width-line-index={authoredLines.length === 1 ? rowIndex : `${rowIndex}:${index}`}
      className={className}
      style={{
        ...style,
        marginTop: index === 0 ? style?.marginTop : 0,
        fontSize,
        lineHeight: wrapLineHeight,
        paddingTop: edgePadding,
        paddingBottom: edgePadding
      }}
    >
      {line || "\u00a0"}
    </p>
  ));
}
