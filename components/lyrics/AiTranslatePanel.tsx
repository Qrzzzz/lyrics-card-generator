"use client";

import { Brain, CircleDot, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

  return (
    <section
      aria-labelledby="ai-translate-title"
      data-testid="ai-translate-panel"
      className="ai-inline-panel mt-3 overflow-hidden rounded-xl border border-[rgb(var(--panel-border))] p-4 sm:p-5"
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
        <button type="button" onClick={loading ? onCancel : onClose} aria-label={copy.cancel} className="app-button grid h-8 w-8 shrink-0 place-items-center rounded-lg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {styles.map((option) => {
          const selected = style === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-style={option.id}
              aria-pressed={selected}
              disabled={loading}
              onClick={() => setStyle(option.id)}
              className={`relative z-10 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                selected
                  ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
              }`}
            >
              <span className="app-text-primary block text-sm font-semibold">{option.name}</span>
              <span className="app-text-muted mt-1 block text-xs leading-relaxed">{option.description}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={loading}
        aria-pressed={reasoning}
        onClick={() => setReasoning((value) => !value)}
        className="app-button mt-4 flex w-full items-center justify-between gap-4 rounded-lg p-3 text-left disabled:opacity-60"
      >
        <span className="flex items-start gap-3">
          <Brain className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="app-text-primary block text-sm font-semibold">{copy.reasoning}</span>
            <span className="app-text-muted mt-1 block text-xs leading-relaxed">{copy.reasoningDescription}</span>
          </span>
        </span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full border transition ${reasoning ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))]" : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))]"}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${reasoning ? "left-6" : "left-1"}`} />
        </span>
      </button>

      {loading ? (
        <section role="status" aria-live="polite" className="settings-panel-card mt-4 overflow-hidden p-4">
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
        </section>
      ) : null}

      {(loading && reasoning) || reasoningText ? (
        <section className="settings-panel-card mt-4 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="app-text-primary text-xs font-semibold uppercase tracking-[0.14em]">{copy.reasoningStream}</p>
            {phase === "reasoning" ? <span className="app-text-subtle text-[11px]">LIVE</span> : null}
          </div>
          <pre ref={reasoningRef} data-testid="ai-reasoning-stream" className="app-text-muted max-h-48 min-h-20 overflow-auto whitespace-pre-wrap rounded-lg border border-[rgb(var(--input-border))] bg-[rgb(var(--input-bg))] p-3 text-xs leading-relaxed">
            {reasoningText || copy.reasoningWaiting}
          </pre>
        </section>
      ) : null}

      {loading || streamingText ? (
        <section className="settings-panel-card mt-4 p-4">
          <p className="app-text-primary mb-2 text-xs font-semibold uppercase tracking-[0.14em]">{copy.streamPreview}</p>
          <pre ref={translationRef} data-testid="ai-translation-stream" className="app-text-primary max-h-52 min-h-20 overflow-auto whitespace-pre-wrap rounded-lg border border-[rgb(var(--input-border))] bg-[rgb(var(--input-bg))] p-3 text-sm leading-relaxed">
            {streamingText || copy.translationWaiting}
          </pre>
        </section>
      ) : null}

      {error ? <p role="alert" className="status-danger mt-4 rounded-lg border px-3 py-2 text-sm">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={loading ? onCancel : onClose} className="app-button h-10 rounded-lg px-4 text-sm font-semibold">{loading ? copy.stop : copy.cancel}</button>
        <button type="button" data-testid="confirm-ai-translate" onClick={() => onConfirm(style, reasoning)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? phaseLabel : copy.translate}
        </button>
      </div>
    </section>
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
