"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

type StarBorderProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  buttonRef?: Ref<HTMLButtonElement>;
  color?: string;
  speed?: string;
  variant?: "default" | "ai";
  children: ReactNode;
};

export function StarBorder({
  buttonRef,
  className = "",
  color = "white",
  speed = "6s",
  variant = "default",
  children,
  style,
  ...rest
}: StarBorderProps) {
  return (
    <button
      ref={buttonRef}
      className={cn("star-border-container", className)}
      data-variant={variant}
      style={{
        ["--star-border-color" as string]: color,
        ["--star-border-speed" as string]: speed,
        ...style
      }}
      {...rest}
    >
      <div className="star-fill-content">{children}</div>
    </button>
  );
}
