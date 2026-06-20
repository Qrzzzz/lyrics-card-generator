import type { ReactNode } from "react";

export function TranslationFieldBorder({
  color,
  speed = "9s",
  children
}: {
  color: string;
  speed?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="translation-star-border"
      style={{
        ["--translation-border-color" as string]: color,
        ["--translation-border-speed" as string]: speed
      }}
    >
      <span aria-hidden="true" className="translation-border-gradient translation-border-gradient--bottom" />
      <span aria-hidden="true" className="translation-border-gradient translation-border-gradient--top" />
      <div className="translation-border-content">{children}</div>
    </div>
  );
}
