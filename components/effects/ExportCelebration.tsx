"use client";

import { useEffect, useRef, useState } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: "rect" | "circle";
};

const COLORS = ["#ffffff", "#ffd166", "#ef476f", "#06d6a0", "#4cc9f0", "#f8f4e3"];

export function ExportCelebration({ burstKey, accentColor = "#7C3AED" }: { burstKey: number; accentColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const accentColorRef = useRef(accentColor);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    accentColorRef.current = accentColor;
  }, [accentColor]);

  useEffect(() => {
    if (burstKey <= 0) {
      particlesRef.current = [];
      setVisible(false);

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      particlesRef.current = [];
      setVisible(false);
      return;
    }

    const canvasElement = canvasRef.current;
    const maybeContext = canvasElement?.getContext("2d");
    if (!canvasElement || !maybeContext) {
      return;
    }

    const canvas = canvasElement;
    const context: CanvasRenderingContext2D = maybeContext;

    let active = true;
    let lastTime = performance.now();
    const palette = [accentColorRef.current, ...COLORS];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(window.innerWidth * dpr);
      canvas.height = Math.ceil(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function random(min: number, max: number) {
      return min + Math.random() * (max - min);
    }

    function addConfettiRain() {
      const count = Math.min(220, Math.max(130, Math.floor(window.innerWidth / 7)));

      for (let index = 0; index < count; index += 1) {
        particlesRef.current.push({
          x: random(-40, window.innerWidth + 40),
          y: random(-220, -20),
          vx: random(-90, 90),
          vy: random(120, 360),
          rotation: random(0, Math.PI * 2),
          rotationSpeed: random(-9, 9),
          size: random(7, 15),
          life: 0,
          maxLife: random(2.6, 4.4),
          color: palette[Math.floor(random(0, palette.length))],
          shape: Math.random() > 0.18 ? "rect" : "circle"
        });
      }
    }

    function drawParticle(particle: Particle, alpha: number) {
      context.save();
      context.globalAlpha = alpha;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;

      if (particle.shape === "circle") {
        context.beginPath();
        context.arc(0, 0, particle.size * 0.46, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.size * 0.5, -particle.size * 0.22, particle.size, particle.size * 0.44);
      }

      context.restore();
    }

    function tick(now: number) {
      const delta = Math.min(0.032, (now - lastTime) / 1000);
      lastTime = now;

      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.life += delta;
        particle.vy += 360 * delta;
        particle.vx += Math.sin((particle.life + particle.x) * 5.4) * 18 * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.rotation += particle.rotationSpeed * delta;

        const progress = particle.life / particle.maxLife;
        const alpha = Math.max(0, 1 - progress * progress);
        drawParticle(particle, alpha);

        return particle.life < particle.maxLife && particle.y < window.innerHeight + 80;
      });

      if (active && particlesRef.current.length > 0) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        setVisible(false);
      }
    }

    setVisible(true);
    resize();
    particlesRef.current = [];
    addConfettiRain();
    animationRef.current = requestAnimationFrame(tick);

    window.addEventListener("resize", resize);

    return () => {
      active = false;
      window.removeEventListener("resize", resize);
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [burstKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80]"
      style={{ opacity: visible ? 1 : 0, pointerEvents: "none" }}
    />
  );
}
