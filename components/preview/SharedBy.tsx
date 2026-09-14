"use client";

export function SharedBy({ text, color, variant = "portrait", scale = 1 }: {
  text: string; color: string; variant?: "portrait" | "landscape"; scale?: number;
}) {
  return (
    <div
      className="w-full min-w-0 text-right [overflow-wrap:anywhere]"
      style={{ color, fontSize: (variant === "landscape" ? 20 : 24) * scale,
        fontWeight: 400, lineHeight: 1.4, letterSpacing: "normal", opacity: 0.82 }}
      data-card-shared-by
    >
      {text}
    </div>
  );
}
