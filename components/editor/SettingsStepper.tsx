"use client";

import { motion, type Transition } from "framer-motion";
import { Check, Download } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { useBalancedStepperLayout } from "@/components/editor/hooks/useBalancedStepperLayout";
import {
  useOptionalExportCardReadinessSnapshot,
  type ExportCardReadinessStore
} from "@/components/editor/hooks/export-card-readiness-store";
import {
  resolvePreviewWorkbenchTrack,
  usePreviewWorkbenchSplit
} from "@/components/editor/hooks/usePreviewWorkbenchSplit";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { getReadableForegroundColor } from "@/lib/contrast-color";
import { StarBorder } from "@/components/ui/StarBorder";
import {
  motionDurations,
  motionEasings,
  reducedMotionTransition,
  stepPanelVariants,
  type StepDirection,
  workbenchStepPanelVariants
} from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";

export type SettingsStepPresentation = "focus" | "lyrics-workspace" | "preview-workbench";

export type SettingsStep = {
  id: string;
  title: string;
  description?: string;
  isComplete?: boolean;
  content: ReactNode;
  /**
   * Describes how the desktop editor presents this step. The stepper itself
   * uses this to opt into the bounded lyrics-workspace skeleton. The desktop
   * editor can also provide a companion aside so the rail spans both columns.
   */
  presentation?: SettingsStepPresentation;
  aside?: ReactNode;
  managesOwnScroll?: boolean;
  navigationGuard?: {
    active: boolean;
    message: string;
    focusTarget?: string;
  };
  secondaryAction?: {
    label: ReactNode;
    onClick: () => void;
    pressed?: boolean;
    expanded?: boolean;
    controls?: string;
    testId?: string;
    disabled?: boolean;
    buttonRef?: RefObject<HTMLButtonElement | null>;
  };
  primaryAction?: {
    label: ReactNode;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    readinessStore?: ExportCardReadinessStore;
  };
};

export type SettingsStepperProps = {
  steps: SettingsStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  nextText?: string;
  backText?: string;
  themeColor?: string;
  compactChrome?: boolean;
  headerActions?: ReactNode;
  companionAside?: ReactNode;
  workbenchResizeLabel?: string;
  onNavigationBlocked?: (message: string) => void;
};

type StepActionsProps = {
  step: SettingsStep;
  stepIndex: number;
  stepCount: number;
  onStepChange: (step: number) => void;
  nextText: string;
  backText: string;
  themeColor: string;
  markerForegroundColor: string;
  compactChrome: boolean;
  className?: string;
};

function StepActions({
  step,
  stepIndex,
  stepCount,
  onStepChange,
  nextText,
  backText,
  themeColor,
  markerForegroundColor,
  compactChrome,
  className
}: StepActionsProps) {
  const isFirstStep = stepIndex <= 0;
  const isLastStep = stepIndex >= stepCount - 1;
  const secondaryAction = step.secondaryAction;
  const primaryAction = step.primaryAction;
  const primaryReadiness = useOptionalExportCardReadinessSnapshot(primaryAction?.readinessStore);
  const isPrimaryActionDisabled = Boolean(
    primaryAction?.disabled || (primaryReadiness && !primaryReadiness.isReady)
  );

  function goToStep(nextStep: number) {
    onStepChange(Math.min(Math.max(nextStep, 0), stepCount - 1));
  }

  return (
    <div className={cn("lyrics-stepper-actions flex items-center justify-between gap-3", className)}>
      {!isFirstStep ? (
        <button
          type="button"
          data-testid="stepper-back-button"
          onClick={() => goToStep(stepIndex - 1)}
          className={cn(
            "app-button rounded-lg px-4 text-sm font-semibold transition",
            compactChrome ? "h-10" : "h-11"
          )}
        >
          {backText}
        </button>
      ) : null}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
        {secondaryAction ? (
          <button
            ref={secondaryAction.buttonRef}
            type="button"
            data-testid={secondaryAction.testId}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            aria-pressed={secondaryAction.pressed}
            aria-expanded={secondaryAction.expanded}
            aria-controls={secondaryAction.controls}
            className={cn(
              "app-button rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-4",
              compactChrome ? "h-10" : "h-11"
            )}
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
            disabled={isPrimaryActionDisabled}
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
            data-testid="stepper-next-button"
            onClick={() => goToStep(stepIndex + 1)}
            className={cn(
              "app-button rounded-lg border px-5 text-sm font-semibold transition",
              compactChrome ? "h-10" : "h-11"
            )}
            style={{ borderColor: themeColor, boxShadow: `0 16px 44px ${themeColor}30` }}
          >
            {nextText}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsStepper({
  steps,
  currentStep,
  onStepChange,
  nextText = "Next",
  backText = "Back",
  themeColor = "#7C3AED",
  compactChrome = false,
  headerActions,
  companionAside,
  workbenchResizeLabel = "Resize settings and preview panes",
  onNavigationBlocked
}: SettingsStepperProps) {
  recordRenderBoundary("Stepper");
  const reduceMotion = useAppReducedMotion();
  const previousStepRef = useRef(currentStep);
  const previousStep = previousStepRef.current;
  // Visited is presentation history only; readiness remains the step's independent completion signal.
  const visitedStepsRef = useRef(new Set([currentStep]));
  visitedStepsRef.current.add(currentStep);
  const stepsGridRef = useRef<HTMLDivElement | null>(null);
  const stepsMeasureRef = useRef<HTMLDivElement | null>(null);
  const stepDirection: StepDirection = currentStep >= previousStep ? 1 : -1;
  const activeStep = steps[currentStep] ?? steps[0];
  const activePresentation = activeStep?.presentation ?? "preview-workbench";
  const isFocus = activePresentation === "focus";
  const isLyricsWorkspace = activePresentation === "lyrics-workspace";
  const hasCompanionAside = Boolean(companionAside);
  const isPreviewWorkbench = activePresentation === "preview-workbench" && hasCompanionAside;
  const workbenchSplit = usePreviewWorkbenchSplit(isPreviewWorkbench);
  const exportStep = steps[steps.length - 1] ?? activeStep;
  const isExportWorkbench = isPreviewWorkbench && currentStep === steps.length - 1;
  const wasExportWorkbench = isPreviewWorkbench && previousStep === steps.length - 1;
  const isWorkbenchPanelTransition = previousStep !== currentStep && (isExportWorkbench || wasExportWorkbench);
  const workbenchTrack = resolvePreviewWorkbenchTrack(workbenchSplit.geometry, isExportWorkbench);
  const balancedWorkbenchPanelWidth = workbenchSplit.geometry.usableWidth / 2;
  // Retain the last preview settings panel while the export panel slides into its track position.
  const lastPreviewSettingsStepRef = useRef<SettingsStep | null>(null);
  if (isPreviewWorkbench && !isExportWorkbench) {
    lastPreviewSettingsStepRef.current = activeStep;
  }
  const workbenchSettingsStep = lastPreviewSettingsStepRef.current
    ?? steps[Math.max(0, steps.length - 2)]
    ?? activeStep;
  const workbenchSettingsStepIndex = Math.max(0, steps.indexOf(workbenchSettingsStep));
  const markerForegroundColor = getReadableForegroundColor(themeColor);
  const variants = stepPanelVariants(reduceMotion ?? false);
  const workbenchStepVariants = workbenchStepPanelVariants(reduceMotion ?? false);
  const transition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.normal, ease: motionEasings.standard };
  const workbenchStepTransition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.slow, ease: motionEasings.emphasized };
  const workbenchTransition: Transition = reduceMotion
    ? reducedMotionTransition
    : { type: "spring", stiffness: 190, damping: 30, mass: 1.02 };
  const workbenchLayoutTransition: Transition = reduceMotion
    ? reducedMotionTransition
    : isWorkbenchPanelTransition
      ? workbenchTransition
      : { duration: 0 };
  const stepMeasurementKey = steps.map((step) => step.title).join("\u0000");
  const stepLayout = useBalancedStepperLayout({
    containerRef: stepsGridRef,
    measureRef: stepsMeasureRef,
    stepCount: steps.length,
    measurementKey: stepMeasurementKey
  });
  const useCompactStepLabel = compactChrome || stepLayout.compact;
  previousStepRef.current = currentStep;

  function goToStep(step: number) {
    const nextStep = Math.min(Math.max(step, 0), steps.length - 1);
    if (nextStep === currentStep) return;

    const guard = activeStep?.navigationGuard;
    if (guard?.active) {
      onNavigationBlocked?.(guard.message);
      const focusTarget = guard.focusTarget;
      if (focusTarget) {
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
        });
      }
      return;
    }

    onStepChange(nextStep);
  }

  return (
    <section
      data-stepper-presentation={activePresentation}
      data-stepper-compact-chrome={compactChrome ? "true" : "false"}
      data-navigation-guard-active={activeStep?.navigationGuard?.active ? "true" : "false"}
      className={cn(
        "grid min-w-0 gap-4",
        isLyricsWorkspace
          ? "lyrics-stepper-shell h-full min-h-0 self-stretch grid-rows-[auto_minmax(0,1fr)_auto]"
          : isPreviewWorkbench
            ? "settings-stepper-workbench content-start self-start"
            : hasCompanionAside
              ? cn(
                  "settings-stepper-workbench content-start self-start",
                  "min-[960px]:grid-cols-[minmax(0,1fr)_320px] min-[1180px]:grid-cols-[minmax(0,1fr)_360px] min-[1440px]:grid-cols-[minmax(0,1fr)_400px]"
                )
              : "content-start self-start"
      )}
    >
      <div
        className={cn(
          "glass-panel lyrics-stepper-rail flex flex-col rounded-lg",
          compactChrome ? "p-3" : "p-4",
          hasCompanionAside && isFocus && "min-[960px]:col-span-2"
        )}
      >
        <div
          data-stepper-heading-row="true"
          className={cn("flex items-start justify-between gap-4", compactChrome ? "mb-3" : "mb-4")}
        >
          <MotionPresence custom={stepDirection} mode="popLayout">
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
              <p
                className={cn(
                  "app-text-subtle uppercase tracking-[0.16em]",
                  compactChrome ? "text-[10px]" : "text-[11px]"
                )}
              >
                {currentStep + 1} / {steps.length}
              </p>
              <h2
                className={cn(
                  "app-text-primary mt-1 font-black",
                  compactChrome ? "text-base" : "text-lg"
                )}
              >
                {activeStep.title}
              </h2>
            </motion.div>
          </MotionPresence>
          {headerActions ? (
            <div className="min-w-0 shrink-0 self-center" data-stepper-header-actions="true">
              {headerActions}
            </div>
          ) : null}
        </div>

        <div
          ref={stepsGridRef}
          className="grid gap-2"
          data-compact={stepLayout.compact ? "true" : "false"}
          style={{
            gridTemplateColumns: `repeat(${compactChrome ? steps.length : stepLayout.columns}, minmax(0, 1fr))`
          }}
        >
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isVisited = visitedStepsRef.current.has(index);
            const isReady = step.isComplete === true;
            const isComplete = index < currentStep;
            const stepState = isActive ? "active" : isComplete ? "complete" : isVisited ? "visited" : "upcoming";

            return (
              <button
                key={step.id}
                type="button"
                data-step-id={step.id}
                onClick={() => goToStep(index)}
                aria-current={isActive ? "step" : undefined}
                data-active={isActive ? "true" : "false"}
                data-visited={isVisited ? "true" : "false"}
                data-ready={isReady ? "true" : "false"}
                data-complete={isComplete ? "true" : "false"}
                data-step-state={stepState}
                className={cn(
                  "group flex min-h-10 min-w-0 items-center gap-2 rounded-lg border text-left transition",
                  compactChrome
                    ? "px-2 py-1.5"
                    : stepLayout.compact
                      ? "px-2 py-2"
                      : "px-2.5 py-2",
                  isActive
                    ? "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg-hover))] app-text-primary shadow-[0_16px_42px_rgba(0,0,0,0.22)]"
                    : isVisited
                      ? "border-[var(--control-selected-border)] bg-[rgb(var(--button-bg))] app-text-primary hover:bg-[rgb(var(--button-bg-hover))]"
                    : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] app-text-muted hover:bg-[rgb(var(--button-bg-hover))] hover:text-[rgb(var(--app-fg))]"
                )}
              >
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full border font-black transition",
                    compactChrome ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]",
                    isActive || isComplete ? "border-transparent text-white" : "border-[rgb(var(--panel-border))] app-text-muted"
                  )}
                  style={isActive || isComplete ? { backgroundColor: themeColor, color: markerForegroundColor } : undefined}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate font-semibold",
                    useCompactStepLabel ? "text-[11px]" : "text-xs"
                  )}
                  title={step.title}
                >
                  {step.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* This invisible rail measures natural labels without inheriting the active grid's truncation. */}
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

      {isPreviewWorkbench ? (
        <div
          ref={workbenchSplit.viewportRef}
          className="preview-workbench-viewport relative min-w-0"
          data-testid="preview-workbench-viewport"
          data-export-active={isExportWorkbench ? "true" : "false"}
          data-settings-ratio={workbenchSplit.geometry.ratio.toFixed(4)}
        >
          <motion.div
            className="preview-workbench-track grid min-w-0 items-stretch"
            data-testid="preview-workbench-track"
            data-export-active={isExportWorkbench ? "true" : "false"}
            initial={false}
            animate={{
              x: isExportWorkbench
                ? workbenchSplit.geometry.viewportWidth > 0
                  ? workbenchTrack.offset
                  : "calc(-50% - 0.625rem)"
                : 0,
              ...(workbenchSplit.isDesktop && workbenchSplit.geometry.viewportWidth > 0
                ? {
                    gridTemplateColumns: `${workbenchTrack.editorWidth}px ${workbenchTrack.previewWidth}px ${workbenchTrack.exportWidth}px`
                  }
                : {})
            }}
            transition={{
              x: workbenchTransition,
              gridTemplateColumns: workbenchLayoutTransition
            }}
          >
            {/* Offscreen track panels stay mounted for motion continuity but must remain inert. */}
            <div
              id="preview-workbench-settings-panel"
              className="preview-workbench-panel preview-workbench-editor flex min-w-0 flex-col gap-4"
              data-workbench-panel="editor-settings"
              data-active={!isExportWorkbench ? "true" : "false"}
              aria-hidden={isExportWorkbench}
              inert={isExportWorkbench ? true : undefined}
            >
              <div className="relative min-w-0 overflow-hidden" data-testid="preview-workbench-settings-transition">
                <MotionPresence custom={stepDirection} mode="popLayout">
                  <motion.div
                    key={workbenchSettingsStep.id}
                    custom={stepDirection}
                    variants={workbenchStepVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={workbenchStepTransition}
                    data-step-direction={stepDirection > 0 ? "forward" : "backward"}
                    data-settings-step-id={workbenchSettingsStep.id}
                  >
                    {workbenchSettingsStep.content}
                  </motion.div>
                </MotionPresence>
              </div>
              <StepActions
                step={workbenchSettingsStep}
                stepIndex={workbenchSettingsStepIndex}
                stepCount={steps.length}
                onStepChange={goToStep}
                nextText={nextText}
                backText={backText}
                themeColor={themeColor}
                markerForegroundColor={markerForegroundColor}
                compactChrome={compactChrome}
                className="mt-auto"
              />
            </div>

            <div
              id="preview-workbench-preview-panel"
              data-stepper-companion="true"
              data-workbench-panel="preview"
              className="preview-workbench-panel preview-workbench-preview min-h-0 min-w-0"
            >
              {companionAside}
            </div>

            <div
              className="preview-workbench-panel preview-workbench-export flex min-w-0 flex-col gap-4"
              data-testid="export-settings-panel"
              data-workbench-panel="export-settings"
              data-active={isExportWorkbench ? "true" : "false"}
              aria-hidden={!isExportWorkbench}
              inert={!isExportWorkbench ? true : undefined}
            >
              <div className="relative min-w-0">{exportStep.content}</div>
              <StepActions
                step={exportStep}
                stepIndex={steps.length - 1}
                stepCount={steps.length}
                onStepChange={goToStep}
                nextText={nextText}
                backText={backText}
                themeColor={themeColor}
                markerForegroundColor={markerForegroundColor}
                compactChrome={compactChrome}
              />
            </div>
          </motion.div>
          {workbenchSplit.isDesktop && !isExportWorkbench && workbenchSplit.geometry.viewportWidth > 0 ? (
            <motion.div
              {...workbenchSplit.separatorProps}
              role="separator"
              aria-label={workbenchResizeLabel}
              aria-controls="preview-workbench-settings-panel preview-workbench-preview-panel"
              aria-orientation="vertical"
              aria-valuemin={Math.round(workbenchSplit.geometry.minRatio * 100)}
              aria-valuemax={Math.round(workbenchSplit.geometry.maxRatio * 100)}
              aria-valuenow={Math.round(workbenchSplit.geometry.ratio * 100)}
              aria-valuetext={`${Math.round(workbenchSplit.geometry.ratio * 100)}%`}
              tabIndex={0}
              title={workbenchResizeLabel}
              className="preview-workbench-resizer"
              data-testid="preview-workbench-resizer"
              data-dragging={workbenchSplit.isDragging ? "true" : "false"}
              initial={wasExportWorkbench ? { left: balancedWorkbenchPanelWidth } : false}
              animate={{ left: workbenchSplit.geometry.settingsWidth }}
              transition={workbenchLayoutTransition}
              style={{
                width: workbenchSplit.geometry.gap
              }}
            />
          ) : null}
        </div>
      ) : (
        <>
          <div
            data-lyrics-viewport-bounds={isLyricsWorkspace ? "true" : undefined}
            className={cn(
              "lyrics-stepper-content relative min-w-0",
              isLyricsWorkspace && "min-h-0 overflow-hidden",
              hasCompanionAside && isFocus && "max-[959px]:order-2 min-[960px]:col-start-1 min-[960px]:row-start-2"
            )}
          >
            <MotionPresence custom={stepDirection}>
              {activeStep ? (
                <motion.div
                  key={activeStep.id}
                  custom={stepDirection}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transition}
                  className={cn(
                    isLyricsWorkspace && "h-full min-h-0",
                    isLyricsWorkspace && activeStep.managesOwnScroll
                      ? "overflow-hidden"
                      : isLyricsWorkspace
                        ? "overflow-y-auto overscroll-contain"
                        : undefined
                  )}
                >
                  {activeStep.content}
                </motion.div>
              ) : null}
            </MotionPresence>
          </div>

          {companionAside ? (
            <div
              data-stepper-companion="true"
              className="min-h-0 min-w-0 max-[959px]:order-3 min-[960px]:col-start-2 min-[960px]:row-start-2 min-[960px]:row-span-2"
            >
              {companionAside}
            </div>
          ) : null}

          <StepActions
            step={activeStep}
            stepIndex={currentStep}
            stepCount={steps.length}
            onStepChange={goToStep}
            nextText={nextText}
            backText={backText}
            themeColor={themeColor}
            markerForegroundColor={markerForegroundColor}
            compactChrome={compactChrome}
            className={cn(
              isLyricsWorkspace && "min-h-0",
              hasCompanionAside && isFocus && "max-[959px]:order-4 min-[960px]:col-start-1 min-[960px]:row-start-3"
            )}
          />
        </>
      )}
    </section>
  );
}
