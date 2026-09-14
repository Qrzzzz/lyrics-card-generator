"use client";

import {
  PROJECT_SIGNATURE_OWNER,
  PROJECT_SIGNATURE_REPOSITORY,
  PROJECT_SIGNATURE_TEXT
} from "@/lib/project-signature";

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
      className="block w-full min-w-0 text-left [overflow-wrap:anywhere]"
      data-project-signature
      style={{
        color,
        fontFamily: "inherit",
        fontSize,
        fontKerning: "normal",
        fontOpticalSizing: "auto",
        fontStretch: "normal",
        fontWeight: 400,
        letterSpacing: "normal",
        lineHeight: 1.4,
        textRendering: "geometricPrecision"
      }}
    >
      <span data-project-signature-owner style={{ opacity: 0.64 }}>
        {PROJECT_SIGNATURE_OWNER}
      </span>
      <span data-project-signature-repository style={{ opacity: 0.64 }}>
        {PROJECT_SIGNATURE_REPOSITORY}
      </span>
    </div>
  );
}
