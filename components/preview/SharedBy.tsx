"use client";

export function SharedBy({ text, color, variant = "portrait" }: { text: string; color: string; variant?: "portrait" | "landscape" }) {
  return (
    <div
      className={
        variant === "landscape"
          ? "line-clamp-2 min-w-0 max-w-[520px] [overflow-wrap:anywhere] text-right text-[22px] font-semibold leading-[1.25] opacity-[0.82]"
          : "min-w-0 max-w-[520px] [overflow-wrap:anywhere] text-right text-[24px] font-bold tracking-wide opacity-90"
      }
      style={{ color }}
      data-card-shared-by
    >
      {text}
    </div>
  );
}
