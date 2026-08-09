"use client";

import { useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";
import { ArrowLeft, CircleAlert, Loader2, RotateCcw } from "lucide-react";
import {
  RetryableLazySurface,
  type DeferredComponentLoader
} from "@/components/editor/RetryableLazySurface";
import { deferredSurfaceCopy } from "@/lib/deferred-surface-copy";
import type { Locale } from "@/lib/types";

type AiTranslatePanelProps = ComponentProps<(typeof import("@/components/lyrics/AiTranslatePanel"))["AiTranslatePanel"]>;
type ExportPanelProps = ComponentProps<(typeof import("@/components/editor/ExportPanel"))["ExportPanel"]>;

const loadAiTranslatePanel: DeferredComponentLoader<AiTranslatePanelProps> = async () => {
  const imported = await import("@/components/lyrics/AiTranslatePanel");
  return { default: imported.AiTranslatePanel };
};

const loadExportPanel: DeferredComponentLoader<ExportPanelProps> = async () => {
  const imported = await import("@/components/editor/ExportPanel");
  return { default: imported.ExportPanel };
};

type DeferredAiTranslatePanelProps = AiTranslatePanelProps & {
  backLabel: string;
  loadComponent?: DeferredComponentLoader<AiTranslatePanelProps>;
};

type DeferredExportPanelProps = ExportPanelProps & {
  label: string;
  locale: Locale;
  loadComponent?: DeferredComponentLoader<ExportPanelProps>;
};

export function DeferredAiTranslatePanel({
  backLabel,
  loadComponent = loadAiTranslatePanel,
  ...props
}: DeferredAiTranslatePanelProps) {
  const failureCopy = deferredSurfaceCopy[props.locale];
  return (
    <RetryableLazySurface
      loadComponent={loadComponent}
      componentProps={props}
      fallback={<DeferredAiPanelFallback backLabel={backLabel} onClose={props.onClose} />}
      renderError={(_error, retry) => (
        <DeferredAiPanelError
          backLabel={backLabel}
          message={failureCopy.loadFailed}
          retryLabel={failureCopy.retry}
          onClose={props.onClose}
          onRetry={retry}
        />
      )}
    />
  );
}

export function DeferredExportPanel({
  label,
  locale,
  loadComponent = loadExportPanel,
  ...props
}: DeferredExportPanelProps) {
  const failureCopy = deferredSurfaceCopy[locale];
  return (
    <RetryableLazySurface
      loadComponent={loadComponent}
      componentProps={props}
      fallback={<DeferredExportPanelFallback label={label} />}
      renderError={(_error, retry) => (
        <DeferredExportPanelError
          message={failureCopy.loadFailed}
          retryLabel={failureCopy.retry}
          onRetry={retry}
        />
      )}
    />
  );
}

function DeferredAiPanelFallback({
  backLabel,
  onClose
}: {
  backLabel: string;
  onClose: () => void;
}) {
  const backButtonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const fallbackBackButton = backButtonRef.current;
    return () => {
      if (document.activeElement !== fallbackBackButton) return;
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(
          '[data-testid="lyrics-translation-ai-page"][data-page-active="true"] [data-testid="ai-translate-panel"] [data-testid="lyrics-ai-page-back"]'
        )?.focus({ preventScroll: true });
      });
    };
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col" data-testid="ai-translate-panel-loading" aria-busy="true">
      <div className="flex shrink-0 items-center border-b border-[rgb(var(--panel-border))] p-3">
        <button
          ref={backButtonRef}
          type="button"
          data-testid="lyrics-ai-page-back"
          aria-label={backLabel}
          onClick={onClose}
          className="control-focus app-button inline-flex size-9 items-center justify-center rounded-lg"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center" role="status" aria-label={backLabel}>
        <Loader2 className="app-text-subtle size-5 animate-spin" aria-hidden="true" />
      </div>
    </section>
  );
}

function DeferredAiPanelError({
  backLabel,
  message,
  retryLabel,
  onClose,
  onRetry
}: {
  backLabel: string;
  message: string;
  retryLabel: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const activePage = rootRef.current?.closest<HTMLElement>(
        '[data-testid="lyrics-translation-ai-page"][data-page-active="true"]'
      );
      if (activePage) retryButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function retryAndRestoreFocus() {
    onRetry();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(
        '[data-testid="lyrics-translation-ai-page"][data-page-active="true"] [data-testid="lyrics-ai-page-back"]'
      )?.focus({ preventScroll: true });
    });
  }

  return (
    <section ref={rootRef} className="flex h-full min-h-0 flex-col" data-testid="ai-translate-panel-error">
      <div className="flex shrink-0 items-center border-b border-[rgb(var(--panel-border))] p-3">
        <button
          type="button"
          data-testid="lyrics-ai-page-back"
          aria-label={backLabel}
          onClick={onClose}
          className="control-focus app-button inline-flex size-9 items-center justify-center rounded-lg"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center px-4 py-5" role="alert">
        <div className="grid max-w-md justify-items-center gap-4 text-center">
          <CircleAlert className="app-text-subtle h-6 w-6" aria-hidden="true" />
          <p className="app-text-muted text-sm leading-relaxed">{message}</p>
          <button
            ref={retryButtonRef}
            type="button"
            data-testid="ai-translate-panel-error-retry"
            onClick={retryAndRestoreFocus}
            className="app-button control-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span>{retryLabel}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function DeferredExportPanelFallback({ label }: { label: string }) {
  return (
    <div
      className="settings-panel-card grid min-h-56 place-items-center"
      data-testid="export-panel-loading"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <Loader2 className="app-text-subtle size-5 animate-spin" aria-hidden="true" />
    </div>
  );
}

function DeferredExportPanelError({
  message,
  retryLabel,
  onRetry
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="settings-panel-card grid min-h-56 place-items-center px-4 py-5"
      data-testid="export-panel-error"
      role="alert"
    >
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <CircleAlert className="app-text-subtle h-6 w-6" aria-hidden="true" />
        <p className="app-text-muted text-sm leading-relaxed">{message}</p>
        <button
          type="button"
          data-testid="export-panel-error-retry"
          onClick={onRetry}
          className="app-button control-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      </div>
    </div>
  );
}
