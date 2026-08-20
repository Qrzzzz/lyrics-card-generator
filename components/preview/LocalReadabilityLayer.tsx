"use client";

import type { CardReadabilityPlan } from "@/lib/background-composition-constraints";

export function LocalReadabilityLayer({ plan }: { plan: CardReadabilityPlan }) {
  const rgb = plan.overlayColor === "#000000" ? "0,0,0" : "255,255,255";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-local-readability-layer="true"
      data-readability-zone-count={plan.zones.length}
      data-readability-overlay={plan.overlayColor === "#000000" ? "darken" : "lighten"}
      data-readability-opacity={plan.overlayOpacity.toFixed(4)}
    >
      {plan.zones.map((zone) => {
        const opacity = plan.overlayOpacity * zone.opacityScale;
        const middleOpacity = opacity * 0.88;
        const centerX = zone.role === "footer" || plan.alignment === "center"
          ? zone.rect.x + zone.rect.width * 0.5
          : Math.max(0, zone.rect.x - zone.feather * 0.55);
        const centerY = zone.rect.y + zone.rect.height * 0.5;
        const nearestHorizontalEdge = Math.min(centerX, plan.canvas.width - centerX);
        const radiusX = Math.max(zone.rect.width * 1.12 + zone.feather, nearestHorizontalEdge + zone.feather * 1.25);
        const radiusY = zone.rect.height * 0.82 + zone.feather * 1.2;
        return (
          <div
            key={zone.id}
            className="absolute"
            data-readability-zone={zone.role}
            data-readability-target-contrast={zone.targetContrast}
            data-readability-feather={zone.feather}
            data-readability-x={zone.rect.x.toFixed(2)}
            data-readability-y={zone.rect.y.toFixed(2)}
            data-readability-width={zone.rect.width.toFixed(2)}
            data-readability-height={zone.rect.height.toFixed(2)}
            style={{
              inset: 0,
              background: `radial-gradient(ellipse ${Math.round(radiusX)}px ${Math.round(radiusY)}px at ${Math.round(centerX)}px ${Math.round(centerY)}px, rgba(${rgb},${opacity.toFixed(4)}) 0%, rgba(${rgb},${middleOpacity.toFixed(4)}) 54%, rgba(${rgb},0) 100%)`
            }}
          />
        );
      })}
    </div>
  );
}
