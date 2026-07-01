"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { getReadableForegroundColor } from "@/lib/contrast-color";
import {
  motionDurations,
  motionEasings,
  reducedMotionTransition,
  stepPanelVariants,
  type StepDirection
} from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export type SettingsStep = {
  id: string;
  title: string;
  description?: string;
  isComplete?: boolean;
  content: ReactNode;
  secondaryAction?: {
    label: ReactNode;
    onClick: () => void;
    pressed?: boolean;
    expanded?: boolean;
    disabled?: boolean;
  };
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
  const previousStepRef = useRef(currentStep);
  const stepDirection: StepDirection = currentStep >= previousStepRef.current ? 1 : -1;
  const activeStep = steps[currentStep] ?? steps[0];
  const isFirstStep = currentStep <= 0;
  const isLastStep = currentStep >= steps.length - 1;
  const secondaryAction = activeStep?.secondaryAction;
  const markerForegroundColor = getReadableForegroundColor(themeColor);
  const variants = stepPanelVariants(reduceMotion ?? false);
  const transition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.normal, ease: motionEasings.standard };

  previousStepRef.current = currentStep;

  function goToStep(step: number) {
    onStepChange(Math.min(Math.max(step, 0), steps.length - 1));
  }

  return (
    <section className={cn("grid min-w-0 gap-4", isLastStep && "content-start")}>
      <div className="glass-panel flex h-[14.25rem] flex-col rounded-lg p-4">
        <div className="mb-4 flex min-h-[5.25rem] items-start justify-between gap-4">
          <MotionPresence>
            <motion.div
              key={activeStep.id}
              custom={stepDirection}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={transition}
              className="min-w-0"
            >
              <p className="app-text-subtle text-[11px] uppercase tracking-[0.16em]">
                {currentStep + 1} / {steps.length}
              </p>
              <h2 className="app-text-primary mt-1 text-lg font-black">{activeStep.title}</h2>
              {activeStep.description ? (
                <p className="app-text-subtle mt-1 line-clamp-2 text-sm leading-5">{activeStep.description}</p>
              ) : null}
            </motion.div>
          </MotionPresence>
        </div>

        <div className="flex flex-wrap gap-2">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(index)}
                aria-current={isActive ? "step" : undefined}
                data-active={isActive ? "true" : "false"}
                className={cn(
                  "group flex flex-[1_1_auto] items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 py-2 text-left transition",
                  isActive
                    ? "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg-hover))] app-text-primary shadow-[0_16px_42px_rgba(0,0,0,0.22)]"
                    : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] app-text-muted hover:bg-[rgb(var(--button-bg-hover))] hover:text-[rgb(var(--app-fg))]"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition",
                    isActive || isComplete ? "border-transparent text-white" : "border-[rgb(var(--panel-border))] app-text-muted"
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
        <MotionPresence>
          {activeStep ? (
            <motion.div
              key={activeStep.id}
              custom={stepDirection}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={transition}
            >
              {activeStep.content}
            </motion.div>
          ) : null}
        </MotionPresence>
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
        <div className="flex items-center gap-3">
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              aria-pressed={secondaryAction.pressed}
              aria-expanded={secondaryAction.expanded}
              className="app-button h-11 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              {secondaryAction.label}
            </button>
          ) : null}
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
      </div>
    </section>
  );
}
