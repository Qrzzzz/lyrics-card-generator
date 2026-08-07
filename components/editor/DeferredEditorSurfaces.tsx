"use client";

import { lazy, memo, Suspense, useEffect, useRef, type ComponentProps } from "react";
import { motion, type Transition } from "framer-motion";
import { Loader2 } from "lucide-react";
import { SurfaceCloseButton } from "@/components/layout/SurfaceCloseButton";
import { importHistoryCopy } from "@/lib/import-history-copy";
import { settingsCopy } from "@/lib/settings/copy";

const LazyExamplesFloor = lazy(async () => {
  const imported = await import("@/components/editor/ExamplesFloor");
  return { default: memo(imported.ExamplesFloor) };
});

const LazyHistoryFloor = lazy(async () => {
  const imported = await import("@/components/editor/HistoryFloor");
  return { default: memo(imported.HistoryFloor) };
});

const LazySettingsSurface = lazy(async () => {
  const imported = await import("@/components/settings/SettingsSurface");
  return { default: memo(imported.SettingsSurface) };
});

type DeferredExamplesSurfaceProps = ComponentProps<typeof LazyExamplesFloor> & {
  mounted: boolean;
};

type DeferredHistorySurfaceProps = ComponentProps<typeof LazyHistoryFloor> & {
  mounted: boolean;
};

type DeferredSettingsSurfaceProps = ComponentProps<typeof LazySettingsSurface> & {
  mounted: boolean;
};

export const DeferredExamplesSurface = memo(function DeferredExamplesSurface({
  mounted,
  ...props
}: DeferredExamplesSurfaceProps) {
  if (!mounted) return null;
  const copy = settingsCopy[props.locale];
  return (
    <Suspense
      fallback={(
        <DeferredSurfaceFallback
          kind="top"
          testId="examples-surface-loading"
          isActive={props.isActive}
          title={copy.examples}
          closeLabel={copy.close}
          onClose={props.onClose}
          transition={props.transition}
        />
      )}
    >
      <LazyExamplesFloor {...props} />
    </Suspense>
  );
});

export const DeferredHistorySurface = memo(function DeferredHistorySurface({
  mounted,
  ...props
}: DeferredHistorySurfaceProps) {
  if (!mounted) return null;
  const copy = importHistoryCopy[props.locale];
  return (
    <Suspense
      fallback={(
        <DeferredSurfaceFallback
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
    >
      <LazyHistoryFloor {...props} />
    </Suspense>
  );
});

export const DeferredSettingsSurface = memo(function DeferredSettingsSurface({
  mounted,
  ...props
}: DeferredSettingsSurfaceProps) {
  if (!mounted) return null;
  const copy = settingsCopy[props.locale];
  return (
    <Suspense
      fallback={(
        <DeferredSurfaceFallback
          kind="right"
          testId="settings-surface-loading"
          isActive={props.isActive}
          title={copy.settings}
          closeLabel={copy.close}
          onClose={props.onClose}
          transition={props.transition}
        />
      )}
    >
      <LazySettingsSurface {...props} />
    </Suspense>
  );
});

function DeferredSurfaceFallback({
  kind,
  testId,
  isActive,
  title,
  closeLabel,
  onClose,
  transition,
  reduceMotion = false
}: {
  kind: "top" | "right";
  testId: string;
  isActive: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  transition: Transition;
  reduceMotion?: boolean;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
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
  }, [isActive, onClose]);

  return (
    <motion.section
      aria-busy="true"
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
              <Loader2 className="h-5 w-5 animate-spin" />
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
      <div className="grid min-h-0 flex-1 place-items-center" role="status">
        <Loader2 className="app-text-subtle h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    </motion.section>
  );
}
