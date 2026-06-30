"use client";

import { Brain, CircleDot, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { ActionButton, OptionCardGroup, ToggleRow } from "@/components/ui/controls";
import { getTranslationStyles } from "@/lib/ai/styles";
import type { AITranslationPhase, TranslationStyle } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { Locale } from "@/lib/types";

export function AiTranslatePanel({
  locale,
  initialStyle,
  initialReasoning,
  loading,
  streamingText,
  reasoningText,
  phase,
  themeColor,
  error,
  onClose,
  onCancel,
  onConfirm
}: {
  locale: Locale;
  initialStyle: TranslationStyle;
  initialReasoning: boolean;
  loading: boolean;
  streamingText: string;
  reasoningText: string;
  phase: AITranslationPhase;
  themeColor: string;
  error: string;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: (style: TranslationStyle, reasoning: boolean) => void;
}) {
  const copy = getAIUiCopy(locale);
  const styles = getTranslationStyles(locale);
  const [style, setStyle] = useState(initialStyle);
  const [reasoning, setReasoning] = useState(initialReasoning);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const reasoningRef = useRef<HTMLPreElement>(null);
  const translationRef = useRef<HTMLPreElement>(null);

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

  const phaseLabel = getPhaseLabel(phase, copy);
  const phaseTip = phase === "connecting" ? copy.connectingTip : copy.connectedTip;
  const styleOptions = styles.map((option) => ({
    value: option.id,
    label: option.name,
    description: option.description,
    disabled: loading,
    dataStyle: option.id
  }));

  return (
    <MotionPanel className="mt-3">
      <section
        aria-labelledby="ai-translate-title"
        data-testid="ai-translate-panel"
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
            aria-label={copy.cancel}
            icon={<X className="h-4 w-4" />}
            className="shrink-0"
          />
        </div>

        <OptionCardGroup
          value={style}
          onChange={(nextStyle) => setStyle(nextStyle as TranslationStyle)}
          options={styleOptions}
          aria-label={copy.aiTranslateTitle}
          className="sm:grid-cols-2"
        />

        <ToggleRow
          label={<span className="flex items-center gap-2"><Brain className="h-4 w-4 shrink-0" />{copy.reasoning}</span>}
          description={copy.reasoningDescription}
          checked={reasoning}
          onChange={setReasoning}
          disabled={loading}
          className="mt-4"
        />

        <MotionPresence>
          {loading ? (
            <MotionPanel key="status" role="status" aria-live="polite" className="settings-panel-card mt-4 overflow-hidden p-4">
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
                {phase === "reasoning" ? <span className="app-text-subtle text-[11px]">LIVE</span> : null}
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

        <div className="mt-5 flex justify-end gap-3">
          <ActionButton onClick={loading ? onCancel : onClose}>{loading ? copy.stop : copy.cancel}</ActionButton>
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
        </div>
      </section>
    </MotionPanel>
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
