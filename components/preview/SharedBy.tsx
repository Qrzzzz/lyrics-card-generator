"use client";

export function SharedBy({ text, color, variant = "portrait", scale = 1, instrumentalAlign }: {
  text: string; color: string; variant?: "portrait" | "landscape"; scale?: number;
  instrumentalAlign?: "left" | "center";
}) {
  return (
    <div
      className="w-full min-w-0 text-right [overflow-wrap:anywhere]"
      style={{ color, fontSize: (variant === "landscape" ? 20 : 24) * scale,
        fontWeight: 700, lineHeight: 1.4, letterSpacing: "normal", opacity: 0.82,
        ...(instrumentalAlign ? { textAlign: instrumentalAlign, fontSize: 23, fontWeight: 600 } : {}) }}
      data-card-shared-by
    >
      {text}
    </div>
  );
}
