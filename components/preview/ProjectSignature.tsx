"use client";

import {
  PROJECT_SIGNATURE_OWNER,
  PROJECT_SIGNATURE_REPOSITORY,
  PROJECT_SIGNATURE_TEXT
} from "@/lib/project-signature";

const PROJECT_SIGNATURE_FONT_FAMILY = 'Inter, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const PORTRAIT_FONT_SIZE = 26;
const LANDSCAPE_FONT_SIZE = 30;

export function ProjectSignature({
  color,
  variant = "portrait",
  scale = 1
}: {
  color: string;
  variant?: "portrait" | "landscape";
  scale?: number;
}) {
  const fontSize = variant === "landscape" ? LANDSCAPE_FONT_SIZE * scale : PORTRAIT_FONT_SIZE;

  return (
    <div
      aria-label={PROJECT_SIGNATURE_TEXT}
      className="flex w-full items-center justify-center whitespace-nowrap"
      data-project-signature
      style={{
        color,
        fontFamily: PROJECT_SIGNATURE_FONT_FAMILY,
        fontSize,
        fontKerning: "normal",
        fontOpticalSizing: "auto",
        fontStretch: "normal",
        fontWeight: 400,
        letterSpacing: "0.02em",
        lineHeight: 1.15,
        textRendering: "geometricPrecision"
      }}
    >
      <span data-project-signature-owner style={{ opacity: 0.72 }}>
        {PROJECT_SIGNATURE_OWNER}
      </span>
      <span data-project-signature-repository style={{ opacity: 0.52 }}>
        {PROJECT_SIGNATURE_REPOSITORY}
      </span>
    </div>
  );
}
