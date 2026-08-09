"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode } from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import {
  createClickSparkAnimationLoop,
  type ClickSparkAnimationLoop
} from "@/components/layout/click-spark-animation-loop";

type Spark = {
  x: number;
  y: number;
  angle: number;
  startTime: number;
  color: string;
  lengthScale: number;
};

export function ClickSpark({
  enabled = true,
  themeColor = "#7C3AED",
  children
}: {
  enabled?: boolean;
  themeColor?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const animationLoopRef = useRef<ClickSparkAnimationLoop | null>(null);
  const reduceMotion = useAppReducedMotion();
  const motionAllowedRef = useRef(enabled && !reduceMotion);
  motionAllowedRef.current = enabled && !reduceMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;

    if (!canvas || !root) {
      return;
    }

    const targetCanvas = canvas;
    const targetRoot = root;

    function resizeCanvas() {
      const rect = targetRoot.getBoundingClientRect();
      // Scale the backing buffer for sharp rendering while preserving CSS-pixel coordinates.
      const ratio = window.devicePixelRatio || 1;
      targetCanvas.width = Math.max(1, Math.round(rect.width * ratio));
      targetCanvas.height = Math.max(1, Math.round(rect.height * ratio));
      targetCanvas.style.width = `${rect.width}px`;
      targetCanvas.style.height = `${rect.height}px`;
      const context = targetCanvas.getContext("2d");
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(targetRoot);
    resizeCanvas();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const resetFrame = () => {
      sparksRef.current = [];
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      context.clearRect(0, 0, width, height);
    };

    const drawFrame = (timestamp: number) => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      context.clearRect(0, 0, width, height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        const duration = 520;

        if (elapsed >= duration) {
          return false;
        }

        const progress = elapsed / duration;
        const eased = progress * (2 - progress);
        const distance = eased * 42 * spark.lengthScale;
        const lineLength = 22 * (1 - eased) * spark.lengthScale;
        const alpha = 1 - progress;
        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        context.save();
        context.globalAlpha = alpha;
        context.strokeStyle = spark.color;
        context.lineWidth = spark.color === "#FFFFFF" ? 2 : 2.8;
        context.shadowBlur = 16;
        context.shadowColor = spark.color;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.restore();

        return true;
      });

      return sparksRef.current.length > 0;
    };

    const animationLoop = createClickSparkAnimationLoop({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
      canAnimate: () => motionAllowedRef.current,
      drawFrame,
      resetFrame
    });
    animationLoopRef.current = animationLoop;

    // A pointer event can arrive immediately after hydration, before passive effects settle.
    if (sparksRef.current.length > 0) {
      animationLoop.start();
    }

    return () => {
      animationLoop.dispose();
      if (animationLoopRef.current === animationLoop) {
        animationLoopRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || reduceMotion) {
      sparksRef.current = [];
      animationLoopRef.current?.stop(true);
    }
  }, [enabled, reduceMotion]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;

    if (!enabled || reduceMotion || !canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();
    const sparkCount = 14;
    const nextSparks = Array.from({ length: sparkCount }, (_, index) => ({
      x,
      y,
      angle: (2 * Math.PI * index) / sparkCount,
      startTime: now,
      color: index % 3 === 0 ? "#FFFFFF" : themeColor,
      lengthScale: index % 2 === 0 ? 1.2 : 0.82
    }));

    // Bound retained sparks so bursty input cannot increase animation work without limit.
    sparksRef.current = [...sparksRef.current, ...nextSparks].slice(-84);
    animationLoopRef.current?.start();
  }

  return (
    <div ref={rootRef} className="relative min-h-screen" onPointerDown={handlePointerDown}>
      {children}
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 z-50 ${enabled && !reduceMotion ? "block" : "hidden"}`}
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />
    </div>
  );
}
