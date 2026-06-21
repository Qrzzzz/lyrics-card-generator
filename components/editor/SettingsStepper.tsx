"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { getReadableForegroundColor } from "@/lib/contrast-color";
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
  themeColor?: string;
};

export function SettingsStepper({
  steps,
  currentStep,
  onStepChange,
  nextText = "Next",
  backText = "Back",
  themeColor = "#7C3AED"
}: SettingsStepperProps) {
  const reduceMotion = useReducedMotion();
  const activeStep = steps[currentStep] ?? steps[0];
  const isFirstStep = currentStep <= 0;
  const isLastStep = currentStep >= steps.length - 1;
  const markerForegroundColor = getReadableForegroundColor(themeColor);

  function goToStep(step: number) {
    onStepChange(Math.min(Math.max(step, 0), steps.length - 1));
  }

  return (
    <section className={cn("grid min-w-0 gap-4", isLastStep && "content-start")}>
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

        <div className="flex flex-wrap gap-2">
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
                  "group flex flex-[1_1_auto] items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 py-2 text-left transition",
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
                <span className="text-xs font-semibold">{step.title}</span>
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

      <div
        className={cn(
          "flex items-center gap-3",
          isLastStep ? "justify-start" : "glass-panel justify-between rounded-lg p-4"
        )}
      >
        <button
          type="button"
          onClick={() => goToStep(currentStep - 1)}
          disabled={isFirstStep}
          className="app-button h-11 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
        >
          {backText}
        </button>
        {!isLastStep ? (
          <button
            type="button"
            onClick={() => goToStep(currentStep + 1)}
            className="app-button h-11 rounded-lg border px-5 text-sm font-semibold transition"
            style={{ borderColor: themeColor, boxShadow: `0 16px 44px ${themeColor}30` }}
          >
            {nextText}
          </button>
        ) : null}
      </div>
    </section>
  );
}
