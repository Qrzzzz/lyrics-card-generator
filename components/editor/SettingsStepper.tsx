"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SettingsStep = {
  id: string;
  title: string;
  description?: string;
  isComplete?: boolean;
  content: ReactNode;
};

export type SettingsStepperProps = {
  steps: SettingsStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  nextText?: string;
  backText?: string;
  completeText?: string;
  completeDisabled?: boolean;
  onComplete?: () => void;
  themeColor?: string;
};

export function SettingsStepper({
  steps,
  currentStep,
  onStepChange,
  nextText = "Next",
  backText = "Back",
  completeText = "Complete & Export",
  completeDisabled = false,
  onComplete,
  themeColor = "#7C3AED"
}: SettingsStepperProps) {
  const reduceMotion = useReducedMotion();
  const activeStep = steps[currentStep] ?? steps[0];
  const isFirstStep = currentStep <= 0;
  const isLastStep = currentStep >= steps.length - 1;
  const markerForegroundColor = getReadableMarkerColor(themeColor);

  function goToStep(step: number) {
    onStepChange(Math.min(Math.max(step, 0), steps.length - 1));
  }

  return (
    <section className="grid min-w-0 gap-4">
      <div className="glass-panel rounded-lg p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeStep.id}
              initial={reduceMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              className="min-w-0"
            >
              <p className="app-text-subtle text-[11px] uppercase tracking-[0.16em]">
                {currentStep + 1} / {steps.length}
              </p>
              <h2 className="app-text-primary mt-1 text-lg font-black">{activeStep.title}</h2>
              {activeStep.description ? (
                <p className="app-text-subtle mt-1 text-sm">{activeStep.description}</p>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isComplete = Boolean(step.isComplete) || index < currentStep;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(index)}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition",
                  isActive
                    ? "border-white/24 bg-white/14 text-white shadow-[0_16px_42px_rgba(0,0,0,0.22)]"
                    : "border-white/10 bg-white/[0.045] text-white/58 hover:bg-white/[0.075] hover:text-white/82"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition",
                    isActive || isComplete ? "border-transparent text-white" : "border-white/14 text-white/56"
                  )}
                  style={isActive || isComplete ? { backgroundColor: themeColor, color: markerForegroundColor } : undefined}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="truncate text-xs font-semibold">{step.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-w-0">
        {steps.map((step, index) => {
          const isActive = index === currentStep;

          return (
            <motion.div
              key={step.id}
              aria-hidden={!isActive}
              className={cn(!isActive && "hidden")}
              initial={false}
              animate={
                reduceMotion
                  ? { opacity: 1, x: 0 }
                  : {
                      opacity: isActive ? 1 : 0,
                      x: isActive ? 0 : index < currentStep ? -18 : 18
                    }
              }
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {step.content}
            </motion.div>
          );
        })}
      </div>

      <div className="glass-panel flex items-center justify-between gap-3 rounded-lg p-4">
        <button
          type="button"
          onClick={() => goToStep(currentStep - 1)}
          disabled={isFirstStep}
          className="app-button h-11 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
        >
          {backText}
        </button>
        <button
          type="button"
          onClick={() => {
            if (isLastStep) {
              onComplete?.();
              return;
            }

            goToStep(currentStep + 1);
          }}
          disabled={isLastStep ? completeDisabled : false}
          className="app-button h-11 rounded-lg px-5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-70"
          style={{ borderColor: themeColor, boxShadow: `0 16px 44px ${themeColor}30` }}
        >
          {isLastStep ? completeText : nextText}
        </button>
      </div>
    </section>
  );
}

function getReadableMarkerColor(backgroundColor: string) {
  const rgb = parseColor(backgroundColor);

  if (!rgb) {
    return "#FFFFFF";
  }

  const whiteContrast = contrastRatio(rgb, [255, 255, 255]);
  const darkContrast = contrastRatio(rgb, [25, 22, 18]);

  return darkContrast >= whiteContrast ? "#191612" : "#FFFFFF";
}

function parseColor(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map((char) => `${char}${char}`).join("")
      : hexMatch[1];

    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16)
    ];
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);

  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch[1].split(",").slice(0, 3).map((part) => Number.parseFloat(part.trim()));

  if (channels.some((channel) => Number.isNaN(channel))) {
    return null;
  }

  return channels.map((channel) => Math.min(255, Math.max(0, Math.round(channel)))) as [number, number, number];
}

function contrastRatio(first: [number, number, number], second: [number, number, number]) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
