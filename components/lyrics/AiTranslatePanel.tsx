"use client";

import { motion, useIsPresent } from "framer-motion";
import { ArrowLeft, Brain, ChevronDown, CircleDot, FolderPen, Loader2, Sparkles, X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { ActionButton, OptionCardGroup, ToggleRow } from "@/components/ui/controls";
import { getTranslationPresets } from "@/lib/ai/styles";
import type { AIPromptLibrary, AITranslationPhase } from "@/lib/ai/types";
import { getAIPromptUiCopy } from "@/lib/ai/prompt-ui-copy";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import {
  reducedMotionTransition,
  sidebarPageTransition,
  sidebarPageVariants,
  type StepDirection
} from "@/lib/motion/tokens";
import type { Locale } from "@/lib/types";

export type AiTranslatePanelPresentation = "inline" | "sidebar-page";

export function AiTranslatePanel({
  locale,
  initialStyle,
  initialReasoning,
  promptLibrary,
  loading,
  streamingText,
  reasoningText,
  phase,
  themeColor,
  error,
  onClose,
  onCancel,
  onConfirm,
  presentation = "inline"
}: {
  locale: Locale;
  initialStyle: string;
  initialReasoning: boolean;
  promptLibrary: AIPromptLibrary;
  loading: boolean;
  streamingText: string;
  reasoningText: string;
  phase: AITranslationPhase;
  themeColor: string;
  error: string;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: (presetId: string, reasoning: boolean) => void;
  presentation?: AiTranslatePanelPresentation;
}) {
  const copy = getAIUiCopy(locale);
  const promptCopy = getAIPromptUiCopy(locale);
  const sidebarPage = presentation === "sidebar-page";
  const reduceMotion = useAppReducedMotion();
  const presets = getTranslationPresets(locale, promptLibrary);
  const builtInPresets = presets.filter((preset) => preset.source !== "custom");
  const customPresets = presets.filter((preset) => preset.source === "custom");
  const [style, setStyle] = useState(initialStyle);
  const [reasoning, setReasoning] = useState(initialReasoning);
  const [customExpanded, setCustomExpanded] = useState(customPresets.some((preset) => preset.id === initialStyle));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runPageOpen, setRunPageOpen] = useState(
    sidebarPage && Boolean(loading || streamingText || reasoningText || error)
  );
  const reasoningRef = useRef<HTMLPreElement>(null);
  const translationRef = useRef<HTMLPreElement>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const setupPageRef = useRef<HTMLElement | null>(null);
  const runPageRef = useRef<HTMLElement | null>(null);
  const previousLoadingRef = useRef(loading);
  const previousRunPageOpenRef = useRef(runPageOpen);
  const pendingStageFocusRef = useRef<"setup" | "run" | null>(null);
  const setupScrollTopRef = useRef(0);
  const runScrollTopRef = useRef(0);
  const stageChanged = previousRunPageOpenRef.current !== runPageOpen;

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (reasoningRef.current) reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
  }, [reasoningText]);

  useEffect(() => {
    if (translationRef.current) translationRef.current.scrollTop = translationRef.current.scrollHeight;
  }, [streamingText]);

  useLayoutEffect(() => {
    const wasLoading = previousLoadingRef.current;
    previousLoadingRef.current = loading;
    if (sidebarPage && loading && !wasLoading) {
      runScrollTopRef.current = 0;
      setRunPageOpen(true);
    }
  }, [loading, sidebarPage]);

  const focusEnteredStage = useCallback((stage: "setup" | "run") => {
    const activeStage = runPageOpen ? "run" : "setup";
    if (
      stage !== activeStage ||
      (pendingStageFocusRef.current !== stage && document.activeElement !== stageViewportRef.current)
    ) {
      return;
    }
    pendingStageFocusRef.current = null;
    const target = stage === "run"
      ? runPageRef.current?.querySelector<HTMLButtonElement>('[data-testid="lyrics-ai-run-page-back"]')
      : setupPageRef.current?.querySelector<HTMLButtonElement>('[data-testid="confirm-ai-translate"]');
    target?.focus({ preventScroll: true });
  }, [runPageOpen]);

  useLayoutEffect(() => {
    if (!stageChanged) return;
    const previousRunPageOpen = previousRunPageOpenRef.current;
    const leavingPage = previousRunPageOpen ? runPageRef.current : setupPageRef.current;
    if (leavingPage) {
      if (previousRunPageOpen) runScrollTopRef.current = leavingPage.scrollTop;
      else setupScrollTopRef.current = leavingPage.scrollTop;
    }
    previousRunPageOpenRef.current = runPageOpen;
    pendingStageFocusRef.current = runPageOpen ? "run" : "setup";
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.closest("[data-ai-sidebar-subpage]")
    ) {
      stageViewportRef.current?.focus({ preventScroll: true });
    }
    const enteringPage = runPageOpen ? runPageRef.current : setupPageRef.current;
    enteringPage?.scrollTo({
      top: runPageOpen ? runScrollTopRef.current : setupScrollTopRef.current
    });
  }, [runPageOpen, stageChanged]);

  useEffect(() => {
    if (!stageChanged || !reduceMotion) return;
    const frame = window.requestAnimationFrame(() => {
      focusEnteredStage(runPageOpen ? "run" : "setup");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusEnteredStage, reduceMotion, runPageOpen, stageChanged]);

  const phaseLabel = getPhaseLabel(phase, copy);
  const phaseTip = phase === "connecting" ? copy.connectingTip : copy.connectedTip;
  const styleOptions = builtInPresets.map((option) => ({
    value: option.id,
    label: option.name,
    description: option.description,
    disabled: loading,
    dataStyle: option.id
  }));
  const customOptions = customPresets.map((option) => ({
    value: option.id,
    label: option.name,
    description: option.description.length > 120 ? `${option.description.slice(0, 120)}…` : option.description,
    disabled: loading,
    dataStyle: option.id
  }));
  function navigateBack() {
    if (loading) onCancel();
    onClose();
  }

  function returnToSetup() {
    if (loading) onCancel();
    setRunPageOpen(false);
  }

  function onSidebarPageKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!runPageOpen || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    returnToSetup();
  }

  const setupControls = (
    <>
      <OptionCardGroup
        value={style}
        onChange={setStyle}
        options={styleOptions}
        aria-label={copy.aiTranslateTitle}
        className="sm:grid-cols-2"
      />

      <div className="mt-3 overflow-hidden rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))]">
          <button
            type="button"
            className="app-text-primary flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--focus-ring))]"
            aria-expanded={customExpanded}
            onClick={() => setCustomExpanded((expanded) => !expanded)}
            disabled={loading}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <FolderPen className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{promptCopy.customPresets}</span>
                <span className="app-text-muted mt-0.5 block text-xs">{customPresets.length}/2 · {promptCopy.manageCustomHint}</span>
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${customExpanded ? "rotate-180" : ""}`} />
          </button>
          {customExpanded ? (
            <div className="border-t border-[rgb(var(--panel-border))] p-3">
              {customOptions.length ? (
                <OptionCardGroup
                  value={style}
                  onChange={setStyle}
                  options={customOptions}
                  aria-label={promptCopy.customPresets}
                  className="sm:grid-cols-2"
                />
              ) : (
                <p className="app-text-muted px-2 py-3 text-xs leading-relaxed">{promptCopy.customPresetsEmpty}</p>
              )}
            </div>
          ) : null}
      </div>

      <ToggleRow
        label={<span className="flex items-center gap-2"><Brain className="h-4 w-4 shrink-0" />{copy.reasoning}</span>}
        description={copy.reasoningDescription}
        checked={reasoning}
        onChange={setReasoning}
        disabled={loading}
        className="mt-4"
      />
    </>
  );

  const runPanels = (
    <>
      <MotionPresence>
        {loading ? (
          <MotionPanel
            key="status"
            role="status"
            aria-live="polite"
            className={`settings-panel-card overflow-hidden p-4 ${sidebarPage ? "" : "mt-4"}`}
            data-testid="ai-translate-run-status"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="app-text-primary flex items-center gap-2 text-sm font-semibold">
                <CircleDot className="h-4 w-4 animate-pulse" style={{ color: themeColor }} />
                {phaseLabel}
              </span>
              <span className="app-text-muted rounded-full bg-[rgb(var(--button-bg))] px-2.5 py-1 font-mono text-[11px]">{elapsedSeconds}s</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/35">
              <span className="ai-stream-progress block h-full w-1/3 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${themeColor}, white, transparent)` }} />
            </div>
            <p className="app-text-muted mt-3 text-xs leading-relaxed">{phaseTip}</p>
          </MotionPanel>
        ) : null}
      </MotionPresence>

      <MotionPresence>
        {(loading && reasoning) || reasoningText ? (
          <MotionPanel key="reasoning" className="settings-panel-card mt-4 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="app-text-primary text-xs font-semibold uppercase tracking-[0.14em]">{copy.reasoningStream}</p>
              {phase === "reasoning" ? <span className="app-text-subtle text-[11px]">{copy.live}</span> : null}
            </div>
            <pre ref={reasoningRef} data-testid="ai-reasoning-stream" className="app-text-muted max-h-48 min-h-20 overflow-auto whitespace-pre-wrap rounded-lg border border-[rgb(var(--input-border))] bg-[rgb(var(--input-bg))] p-3 text-xs leading-relaxed">
              {reasoningText || copy.reasoningWaiting}
            </pre>
          </MotionPanel>
        ) : null}
      </MotionPresence>

      <MotionPresence>
        {loading || streamingText ? (
          <MotionPanel key="translation" className="settings-panel-card mt-4 p-4">
            <p className="app-text-primary mb-2 text-xs font-semibold uppercase tracking-[0.14em]">{copy.streamPreview}</p>
            <pre ref={translationRef} data-testid="ai-translation-stream" className="app-text-primary max-h-52 min-h-20 overflow-auto whitespace-pre-wrap rounded-lg border border-[rgb(var(--input-border))] bg-[rgb(var(--input-bg))] p-3 text-sm leading-relaxed">
              {streamingText || copy.translationWaiting}
            </pre>
          </MotionPanel>
        ) : null}
      </MotionPresence>

      {error ? <p role="alert" className="status-danger mt-4 rounded-lg border px-3 py-2 text-sm">{error}</p> : null}
    </>
  );

  const confirmAction = (
    <ActionButton
      data-testid="confirm-ai-translate"
      variant="primary"
      onClick={() => onConfirm(style, reasoning)}
      disabled={loading}
      leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      style={{ borderColor: themeColor, boxShadow: `0 12px 30px ${themeColor}30` }}
    >
      {loading ? phaseLabel : copy.translate}
    </ActionButton>
  );

  if (sidebarPage) {
    const direction: StepDirection = runPageOpen ? 1 : -1;
    return (
      <section
        aria-labelledby={runPageOpen ? "ai-translate-run-title" : "ai-translate-title"}
        data-testid="ai-translate-panel"
        data-presentation={presentation}
        className="h-full min-h-0 overflow-hidden"
        style={{ ["--ai-accent" as string]: themeColor }}
        onKeyDown={onSidebarPageKeyDown}
      >
        <div
          ref={stageViewportRef}
          tabIndex={-1}
          className="relative h-full min-h-0 overflow-hidden focus:outline-none"
          data-testid="ai-translate-stage-viewport"
          data-ai-stage={runPageOpen ? "run" : "setup"}
          data-reduced-motion={reduceMotion ? "true" : "false"}
        >
          <MotionPresence mode="sync" custom={direction}>
            {runPageOpen ? (
              <AiSidebarSubpage
                key="run"
                direction={direction}
                reducedMotion={reduceMotion}
                pageRef={runPageRef}
                testId="ai-translate-run-page"
                onEntered={() => focusEnteredStage("run")}
              >
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={returnToSetup}
                    aria-label={loading ? copy.stopAndBack : copy.back}
                    title={loading ? copy.stopAndBack : copy.back}
                    className="control-focus app-text-primary inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold transition hover:bg-white/5"
                    data-testid="lyrics-ai-run-page-back"
                  >
                    <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate" id="ai-translate-run-title">{copy.aiTranslateTitle}</span>
                  </button>
                  <p className="app-text-muted mt-2 px-2 text-xs leading-relaxed">
                    {loading ? phaseTip : copy.streamPreview}
                  </p>
                </div>

                {runPanels}

                <div className="mt-5 flex justify-end gap-3">
                  {loading ? (
                    <ActionButton data-testid="cancel-ai-translate" onClick={onCancel}>{copy.stop}</ActionButton>
                  ) : (
                    <ActionButton data-testid="ai-run-back-to-setup" onClick={returnToSetup}>{copy.back}</ActionButton>
                  )}
                </div>
              </AiSidebarSubpage>
            ) : (
              <AiSidebarSubpage
                key="setup"
                direction={direction}
                reducedMotion={reduceMotion}
                pageRef={setupPageRef}
                testId="ai-translate-setup-page"
                onEntered={() => focusEnteredStage("setup")}
              >
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={navigateBack}
                    aria-label={copy.back}
                    title={copy.back}
                    className="control-focus app-text-primary inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold transition hover:bg-white/5"
                    data-testid="lyrics-ai-page-back"
                  >
                    <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate" id="ai-translate-title">{copy.aiTranslateTitle}</span>
                  </button>
                  <p className="app-text-muted mt-2 px-2 text-xs leading-relaxed">{copy.aiTranslateDescription}</p>
                </div>

                {setupControls}

                <div className="mt-5 flex justify-end gap-3">
                  {confirmAction}
                </div>
              </AiSidebarSubpage>
            )}
          </MotionPresence>
        </div>
      </section>
    );
  }

  const inlinePanel = (
    <section
      aria-labelledby="ai-translate-title"
      data-testid="ai-translate-panel"
      data-presentation={presentation}
      className="ai-inline-panel overflow-hidden rounded-xl border border-[rgb(var(--panel-border))] p-4 sm:p-5"
      style={{ ["--ai-accent" as string]: themeColor }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 app-text-primary" style={{ filter: `drop-shadow(0 0 7px ${themeColor})` }} />
            <h3 id="ai-translate-title" className="app-text-primary text-base font-bold">{copy.aiTranslateTitle}</h3>
          </div>
          <p className="app-text-muted text-xs leading-relaxed">{copy.aiTranslateDescription}</p>
        </div>
        <ActionButton
          variant="icon"
          size="sm"
          onClick={loading ? onCancel : onClose}
          aria-label={loading ? copy.stop : copy.close}
          icon={<X className="h-4 w-4" />}
          className="shrink-0"
        />
      </div>

      {setupControls}
      {runPanels}

      <div className="mt-5 flex justify-end gap-3">
        <ActionButton onClick={loading ? onCancel : onClose}>{loading ? copy.stop : copy.close}</ActionButton>
        {confirmAction}
      </div>
    </section>
  );

  return <MotionPanel className="mt-3">{inlinePanel}</MotionPanel>;
}

function AiSidebarSubpage({
  children,
  direction,
  reducedMotion,
  pageRef,
  testId,
  onEntered
}: {
  children: ReactNode;
  direction: StepDirection;
  reducedMotion: boolean;
  pageRef: Ref<HTMLElement>;
  testId: string;
  onEntered: () => void;
}) {
  const isPresent = useIsPresent();

  return (
    <motion.section
      ref={pageRef}
      custom={direction}
      variants={sidebarPageVariants(reducedMotion)}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reducedMotion ? reducedMotionTransition : sidebarPageTransition}
      onAnimationComplete={() => {
        if (isPresent) onEntered();
      }}
      aria-hidden={isPresent ? undefined : true}
      inert={isPresent ? undefined : true}
      className="absolute inset-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]"
      data-ai-sidebar-subpage={testId}
      data-testid={testId}
      data-page-active={isPresent ? "true" : "false"}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
    >
      {children}
    </motion.section>
  );
}

function getPhaseLabel(phase: AITranslationPhase, copy: ReturnType<typeof getAIUiCopy>) {
  switch (phase) {
    case "connected": return copy.phaseConnected;
    case "reasoning": return copy.phaseReasoning;
    case "translating": return copy.phaseTranslating;
    default: return copy.phaseConnecting;
  }
}
