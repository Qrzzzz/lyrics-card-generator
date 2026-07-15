"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { LyricCard, getCardSize } from "@/components/preview/LyricCard";
import type { createT } from "@/lib/i18n";
import type { CardStyle, Locale, SongInfo } from "@/lib/types";

export function LyricCardPreview({
  song,
  lyrics,
  style,
  cardRef,
  t,
  sticky = true,
  locale = "en",
  measurementKey = 0,
  pressureEnabled = true
}: {
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
  cardRef: React.RefObject<HTMLElement | null>;
  t: ReturnType<typeof createT>;
  sticky?: boolean;
  locale?: Locale;
  measurementKey?: number;
  pressureEnabled?: boolean;
}) {
  const reduceMotion = useAppReducedMotion();
  const pressureFeedbackEnabled = pressureEnabled && !reduceMotion;
  const shellRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [availableHeight, setAvailableHeight] = useState(320);
  const rotateXTarget = useMotionValue(0);
  const rotateYTarget = useMotionValue(0);
  const xTarget = useMotionValue(0);
  const yTarget = useMotionValue(0);
  const zTarget = useMotionValue(0);
  const scaleTarget = useMotionValue(1);
  const spring = { stiffness: 285, damping: 30, mass: 0.52 };
  const rotateX = useSpring(rotateXTarget, spring);
  const rotateY = useSpring(rotateYTarget, spring);
  const x = useSpring(xTarget, spring);
  const y = useSpring(yTarget, spring);
  const z = useSpring(zTarget, spring);
  const pressureScale = useSpring(scaleTarget, { stiffness: 420, damping: 34, mass: 0.48 });
  const size = getCardSize(style);
  const widthScale = Math.max(width, 120) / size.width;
  const heightScale = Math.max(availableHeight, 120) / size.height;
  const scale = Math.min(widthScale, heightScale, 0.52);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
          return;
        }
        const styles = window.getComputedStyle(shell);
        const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
        const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
        setWidth(Math.max(0, shell.clientWidth - horizontalPadding));
        setAvailableHeight(Math.max(0, window.innerHeight - rect.top - verticalPadding - 16));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measurementKey]);

  useEffect(() => {
    if (!pressureFeedbackEnabled) resetPressureFeedback();
  }, [pressureFeedbackEnabled]);

  function resetPressureFeedback() {
    rotateXTarget.set(0);
    rotateYTarget.set(0);
    xTarget.set(0);
    yTarget.set(0);
    zTarget.set(0);
    scaleTarget.set(1);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pressureFeedbackEnabled || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normalizedX = Math.min(1, Math.max(-1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    const normalizedY = Math.min(1, Math.max(-1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));

    rotateXTarget.set(normalizedY * -5.5);
    rotateYTarget.set(normalizedX * 7.5);
    xTarget.set(normalizedX * 3.5);
    yTarget.set(normalizedY * 2.5 - 2);
    event.currentTarget.style.setProperty("--preview-pressure-x", `${((normalizedX + 1) / 2) * 100}%`);
    event.currentTarget.style.setProperty("--preview-pressure-y", `${((normalizedY + 1) / 2) * 100}%`);
  }

  function handlePointerEnter(event: React.PointerEvent<HTMLDivElement>) {
    if (!pressureFeedbackEnabled || event.pointerType === "touch") return;
    zTarget.set(18);
    scaleTarget.set(1.012);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!pressureFeedbackEnabled || event.pointerType === "touch" || !event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zTarget.set(4);
    yTarget.set(1);
    scaleTarget.set(0.992);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!pressureFeedbackEnabled || event.pointerType === "touch") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const isPointerInside = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
    if (!isPointerInside) {
      resetPressureFeedback();
      return;
    }

    zTarget.set(18);
    scaleTarget.set(1.012);
    handlePointerMove(event);
  }

  return (
    <section data-testid="lyric-card-preview" className={`glass-panel min-w-0 self-start rounded-lg p-4 ${sticky ? "sticky top-6" : ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="app-text-subtle text-[11px] uppercase tracking-[0.16em]">{t("livePreview")}</p>
          <h2 className="app-text-primary text-base font-semibold">{t("exportCardOnly")}</h2>
        </div>
        <span className="app-text-subtle rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] px-2.5 py-1 text-xs">
          {size.width}x{size.height}
        </span>
      </div>
      <div
        ref={shellRef}
        data-testid="lyric-card-preview-shell"
        data-preview-scale={scale.toFixed(4)}
        className="flex min-w-0 items-center justify-center overflow-hidden rounded-lg bg-black/18 p-3"
      >
        <div
          data-testid="lyric-card-preview-pressure"
          data-pressure-enabled={pressureFeedbackEnabled ? "true" : "false"}
          className="preview-pressure-stage relative"
          style={{
            width: size.width * scale,
            height: size.height * scale,
            maxWidth: "100%"
          }}
          onPointerMove={handlePointerMove}
          onPointerEnter={handlePointerEnter}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={resetPressureFeedback}
          onPointerLeave={resetPressureFeedback}
        >
          <motion.div
            className="preview-pressure-card relative"
            style={{
              width: size.width * scale,
              height: size.height * scale,
              rotateX,
              rotateY,
              x,
              y,
              z,
              scale: pressureScale,
              transformStyle: "preserve-3d"
            }}
          >
            <div
              ref={cardRef as React.RefObject<HTMLDivElement>}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left"
              }}
            >
              <LyricCard song={song} lyrics={lyrics} style={style} locale={locale} />
            </div>
            <span className="preview-pressure-highlight pointer-events-none absolute inset-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
