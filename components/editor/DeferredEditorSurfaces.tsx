"use client";

import { memo, useEffect, useRef, type ComponentProps } from "react";
import { motion, type Transition } from "framer-motion";
import { CircleAlert, Loader2, RotateCcw } from "lucide-react";
import {
  RetryableLazySurface,
  type DeferredComponentLoader
} from "@/components/editor/RetryableLazySurface";
import { SurfaceCloseButton } from "@/components/layout/SurfaceCloseButton";
import { deferredSurfaceCopy } from "@/lib/deferred-surface-copy";
import { importHistoryCopy } from "@/lib/import-history-copy";
import { settingsCopy } from "@/lib/settings/copy";

type ExamplesFloorProps = ComponentProps<(typeof import("@/components/editor/ExamplesFloor"))["ExamplesFloor"]>;
type HistoryFloorProps = ComponentProps<(typeof import("@/components/editor/HistoryFloor"))["HistoryFloor"]>;
type SettingsSurfaceProps = ComponentProps<(typeof import("@/components/settings/SettingsSurface"))["SettingsSurface"]>;

const loadExamplesFloor: DeferredComponentLoader<ExamplesFloorProps> = async () => {
  const imported = await import("@/components/editor/ExamplesFloor");
  return { default: memo(imported.ExamplesFloor) };
};

const loadHistoryFloor: DeferredComponentLoader<HistoryFloorProps> = async () => {
  const imported = await import("@/components/editor/HistoryFloor");
  return { default: memo(imported.HistoryFloor) };
};

const loadSettingsSurface: DeferredComponentLoader<SettingsSurfaceProps> = async () => {
  const imported = await import("@/components/settings/SettingsSurface");
  return { default: memo(imported.SettingsSurface) };
};

type DeferredExamplesSurfaceProps = ExamplesFloorProps & {
  mounted: boolean;
  loadComponent?: DeferredComponentLoader<ExamplesFloorProps>;
};

type DeferredHistorySurfaceProps = HistoryFloorProps & {
  mounted: boolean;
  loadComponent?: DeferredComponentLoader<HistoryFloorProps>;
};

type DeferredSettingsSurfaceProps = SettingsSurfaceProps & {
  mounted: boolean;
  loadComponent?: DeferredComponentLoader<SettingsSurfaceProps>;
};

export const DeferredExamplesSurface = memo(function DeferredExamplesSurface({
  mounted,
  loadComponent = loadExamplesFloor,
  ...props
}: DeferredExamplesSurfaceProps) {
  if (!mounted) return null;
  const copy = settingsCopy[props.locale];
  const failureCopy = deferredSurfaceCopy[props.locale];
  return (
    <RetryableLazySurface
      loadComponent={loadComponent}
      componentProps={props}
      fallback={(
        <DeferredSurfaceStatus
          mode="loading"
          kind="top"
          testId="examples-surface-loading"
          isActive={props.isActive}
          title={copy.examples}
          closeLabel={copy.close}
          onClose={props.onClose}
          transition={props.transition}
        />
      )}
      renderError={(_error, retry) => (
        <DeferredSurfaceStatus
          mode="error"
          kind="top"
          testId="examples-surface-error"
          isActive={props.isActive}
          title={copy.examples}
          closeLabel={copy.close}
          errorMessage={failureCopy.loadFailed}
          retryLabel={failureCopy.retry}
          onClose={props.onClose}
          onRetry={retry}
          transition={props.transition}
        />
      )}
    />
  );
});

export const DeferredHistorySurface = memo(function DeferredHistorySurface({
  mounted,
  loadComponent = loadHistoryFloor,
  ...props
}: DeferredHistorySurfaceProps) {
  if (!mounted) return null;
  const copy = importHistoryCopy[props.locale];
  const failureCopy = deferredSurfaceCopy[props.locale];
  return (
    <RetryableLazySurface
      loadComponent={loadComponent}
      componentProps={props}
      fallback={(
        <DeferredSurfaceStatus
          mode="loading"
          kind="top"
          testId="history-surface-loading"
          isActive={props.isActive}
          title={copy.title}
          closeLabel={settingsCopy[props.locale].close}
          onClose={props.onClose}
          transition={props.transition}
          reduceMotion={props.reduceMotion}
        />
      )}
      renderError={(_error, retry) => (
        <DeferredSurfaceStatus
          mode="error"
          kind="top"
          testId="history-surface-error"
          isActive={props.isActive}
          title={copy.title}
          closeLabel={settingsCopy[props.locale].close}
          errorMessage={failureCopy.loadFailed}
          retryLabel={failureCopy.retry}
          onClose={props.onClose}
          onRetry={retry}
          transition={props.transition}
          reduceMotion={props.reduceMotion}
        />
      )}
    />
  );
});

export const DeferredSettingsSurface = memo(function DeferredSettingsSurface({
  mounted,
  loadComponent = loadSettingsSurface,
  ...props
}: DeferredSettingsSurfaceProps) {
  if (!mounted) return null;
  const copy = settingsCopy[props.locale];
  const failureCopy = deferredSurfaceCopy[props.locale];
  return (
    <RetryableLazySurface
      loadComponent={loadComponent}
      componentProps={props}
      fallback={(
        <DeferredSurfaceStatus
          mode="loading"
          kind="right"
          testId="settings-surface-loading"
          isActive={props.isActive}
          title={copy.settings}
          closeLabel={copy.close}
          onClose={props.onClose}
          transition={props.transition}
        />
      )}
      renderError={(_error, retry) => (
        <DeferredSurfaceStatus
          mode="error"
          kind="right"
          testId="settings-surface-error"
          isActive={props.isActive}
          title={copy.settings}
          closeLabel={copy.close}
          errorMessage={failureCopy.loadFailed}
          retryLabel={failureCopy.retry}
          onClose={props.onClose}
          onRetry={retry}
          transition={props.transition}
        />
      )}
    />
  );
});

function DeferredSurfaceStatus({
  mode,
  kind,
  testId,
  isActive,
  title,
  closeLabel,
  onClose,
  onRetry,
  errorMessage,
  retryLabel,
  transition,
  reduceMotion = false
}: {
  mode: "loading" | "error";
  kind: "top" | "right";
  testId: string;
  isActive: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  onRetry?: () => void;
  errorMessage?: string;
  retryLabel?: string;
  transition: Transition;
  reduceMotion?: boolean;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const frame = window.requestAnimationFrame(() => {
      const target = mode === "error" ? retryButtonRef.current : closeButtonRef.current;
      target?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isActive, mode, onClose]);

  return (
    <motion.section
      aria-busy={mode === "loading" ? "true" : undefined}
      aria-hidden={!isActive}
      aria-labelledby={`${testId}-title`}
      className={[
        "settings-surface absolute inset-0 z-20 flex min-w-0 flex-col overflow-hidden",
        isActive ? "pointer-events-auto" : "pointer-events-none"
      ].join(" ")}
      data-testid={testId}
      data-surface-state={isActive ? "open" : "closed"}
      animate={kind === "right"
        ? { x: isActive ? "0%" : "100%", opacity: isActive ? 1 : 0 }
        : { y: reduceMotion ? "0%" : isActive ? "0%" : "-100%", opacity: isActive ? 1 : 0 }}
      initial={false}
      inert={!isActive ? true : undefined}
      transition={transition}
    >
      <header className="settings-wing__header">
        <div className="settings-wing__identity min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="settings-wing__icon" aria-hidden="true">
              {mode === "loading"
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <CircleAlert className="h-5 w-5" />}
            </span>
            <h1 id={`${testId}-title`} className="app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl">
              {title}
            </h1>
          </div>
        </div>
        <div className="settings-wing__actions flex shrink-0 items-center gap-2 sm:gap-3">
          <SurfaceCloseButton
            buttonRef={closeButtonRef}
            label={closeLabel}
            testId={`${testId}-close`}
            onClick={onClose}
          />
        </div>
      </header>
      <div
        className={mode === "error"
          ? "grid min-h-0 flex-1 place-items-center px-5 py-5"
          : "grid min-h-0 flex-1 place-items-center"}
        role={mode === "error" ? "alert" : "status"}
      >
        {mode === "loading" ? (
          <Loader2 className="app-text-subtle h-6 w-6 animate-spin" aria-hidden="true" />
        ) : (
          <div className="grid max-w-md justify-items-center gap-4 text-center">
            <p className="app-text-muted text-sm leading-relaxed">{errorMessage}</p>
            <button
              ref={retryButtonRef}
              type="button"
              data-testid={`${testId}-retry`}
              onClick={onRetry}
              className="app-button control-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span>{retryLabel}</span>
            </button>
          </div>
        )}
      </div>
    </motion.section>
  );
}
