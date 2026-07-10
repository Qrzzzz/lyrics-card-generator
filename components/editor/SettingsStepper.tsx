"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Download } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useBalancedStepperLayout } from "@/components/editor/hooks/useBalancedStepperLayout";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { getReadableForegroundColor } from "@/lib/contrast-color";
import { StarBorder } from "@/components/ui/StarBorder";
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
  primaryAction?: {
    label: ReactNode;
    onClick: () => void | Promise<void>;
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
  const stepsGridRef = useRef<HTMLDivElement | null>(null);
  const stepsMeasureRef = useRef<HTMLDivElement | null>(null);
  const stepDirection: StepDirection = currentStep >= previousStepRef.current ? 1 : -1;
  const activeStep = steps[currentStep] ?? steps[0];
  const isFirstStep = currentStep <= 0;
  const isLastStep = currentStep >= steps.length - 1;
  const secondaryAction = activeStep?.secondaryAction;
  const primaryAction = activeStep?.primaryAction;
  const markerForegroundColor = getReadableForegroundColor(themeColor);
  const variants = stepPanelVariants(reduceMotion ?? false);
  const transition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.normal, ease: motionEasings.standard };
  const stepMeasurementKey = steps.map((step) => step.title).join("\u0000");
  const stepLayout = useBalancedStepperLayout({
    containerRef: stepsGridRef,
    measureRef: stepsMeasureRef,
    stepCount: steps.length,
    measurementKey: stepMeasurementKey
  });
  previousStepRef.current = currentStep;

  function goToStep(step: number) {
    onStepChange(Math.min(Math.max(step, 0), steps.length - 1));
  }

  return (
    <section className="grid min-w-0 content-start self-start gap-4">
      <div className="glass-panel flex flex-col rounded-lg p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <MotionPresence mode="popLayout">
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
            </motion.div>
          </MotionPresence>
        </div>

        <div
          ref={stepsGridRef}
          className="grid gap-2"
          data-compact={stepLayout.compact ? "true" : "false"}
          style={{
            gridTemplateColumns: `repeat(${stepLayout.columns}, minmax(0, 1fr))`
          }}
        >
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <button
                key={step.id}
                type="button"
                data-step-id={step.id}
                onClick={() => goToStep(index)}
                aria-current={isActive ? "step" : undefined}
                data-active={isActive ? "true" : "false"}
                className={cn(
                  "group flex min-h-10 min-w-0 items-center gap-2 rounded-lg border text-left transition",
                  stepLayout.compact ? "px-2 py-2" : "px-2.5 py-2",
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
                <span
                  className={cn(
                    "min-w-0 truncate font-semibold",
                    stepLayout.compact ? "text-[11px]" : "text-xs"
                  )}
                  title={step.title}
                >
                  {step.title}
                </span>
              </button>
            );
          })}
        </div>

        <div
          ref={stepsMeasureRef}
          aria-hidden="true"
          className="pointer-events-none invisible fixed left-0 top-0 -z-10 flex h-0 w-0 gap-2 overflow-hidden"
        >
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              tabIndex={-1}
              className="flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 py-2 text-left text-xs font-semibold"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black">
                {index + 1}
              </span>
              <span>{step.title}</span>
            </button>
          ))}
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

      <div className="flex items-center justify-between gap-3">
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
          {isLastStep && primaryAction ? (
            <StarBorder
              type="button"
              data-testid="complete-export-button"
              color={themeColor}
              speed="7.2s"
              onClick={() => void primaryAction.onClick()}
              disabled={primaryAction.disabled}
              className="complete-export-button transition hover:scale-[1.006] disabled:cursor-default disabled:opacity-70"
              style={{
                minHeight: 44,
                borderRadius: 8,
                color: markerForegroundColor,
                filter: `drop-shadow(0 12px 28px ${themeColor}44)`
              }}
            >
              <span className="inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black tracking-normal sm:px-8">
                <Download className="h-5 w-5 shrink-0" />
                <span className="whitespace-nowrap">{primaryAction.label}</span>
              </span>
            </StarBorder>
          ) : !isLastStep ? (
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
