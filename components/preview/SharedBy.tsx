"use client";

export function SharedBy({ text, color, variant = "portrait" }: { text: string; color: string; variant?: "portrait" | "landscape" }) {
  return (
    <div
      className={
        variant === "landscape"
          ? "line-clamp-2 max-w-[520px] text-right text-[22px] font-semibold leading-[1.25] opacity-[0.82] drop-shadow-sm"
          : "max-w-[520px] text-right text-[24px] font-bold tracking-wide opacity-90 drop-shadow-sm"
      }
      style={{ color }}
    >
      {text}
    </div>
  );
}
