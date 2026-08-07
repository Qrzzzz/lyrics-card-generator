"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type AccessibleDialogProps = {
  open: boolean;
  role?: "dialog" | "alertdialog";
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  escapeCloses?: boolean;
  closeOnBackdrop?: boolean;
  initialFocusSelector?: string;
  returnFocusSelector?: string;
  overlayClassName?: string;
  panelClassName?: string;
  testId?: string;
  children: React.ReactNode;
};

type InertState = { count: number; inert: boolean; ariaHidden: string | null };
const inertStates = new Map<HTMLElement, InertState>();

export function AccessibleDialog({
  open,
  role = "dialog",
  labelledBy,
  describedBy,
  onClose,
  escapeCloses = true,
  closeOnBackdrop = true,
  initialFocusSelector,
  returnFocusSelector,
  overlayClassName,
  panelClassName,
  testId,
  children
}: AccessibleDialogProps) {
  const reduceMotion = useReducedMotion();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const releaseInertRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = returnFocusSelector
      ? document.querySelector<HTMLElement>(returnFocusSelector)
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const target = initialFocusSelector
        ? panelRef.current?.querySelector<HTMLElement>(initialFocusSelector)
        : firstFocusable(panelRef.current);
      (target ?? panelRef.current)?.focus({ preventScroll: true });
      // Acquire inert only after the portal root exists, excluding the dialog itself from targets.
      if (overlayRef.current && !releaseInertRef.current) {
        releaseInertRef.current = acquireBackgroundInert(overlayRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocusSelector, open, returnFocusSelector]);

  useEffect(() => () => {
    releaseInertRef.current?.();
    releaseInertRef.current = null;
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        // Keep the background inaccessible until the visible exit animation has finished.
        releaseInertRef.current?.();
        releaseInertRef.current = null;
        const target = returnFocusSelector
          ? document.querySelector<HTMLElement>(returnFocusSelector)
          : restoreFocusRef.current;
        target?.focus({ preventScroll: true });
      }}
    >
      {open ? (
        <motion.div
          ref={overlayRef}
          data-testid={testId}
          className={cn("fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm", overlayClassName)}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onMouseDown={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (!escapeCloses) return;
              event.preventDefault();
              event.stopPropagation();
              onClose();
              return;
            }
            if (event.key === "Tab") trapTabKey(event, panelRef.current);
          }}
        >
          <motion.div
            ref={panelRef}
            role={role}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            tabIndex={-1}
            className={cn("relative w-full", panelClassName)}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function focusableElements(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function firstFocusable(root: HTMLElement | null) {
  return focusableElements(root)[0];
}

function trapTabKey(event: React.KeyboardEvent, root: HTMLElement | null) {
  // Modal focus wraps across only the currently enabled, visible controls.
  const focusable = focusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    root?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function acquireBackgroundInert(dialogRoot: HTMLElement) {
  const bodyChild = Array.from(document.body.children).find((child) => child === dialogRoot || child.contains(dialogRoot));
  const targets = Array.from(document.body.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child !== bodyChild
  );
  targets.forEach((element) => {
    const state = inertStates.get(element);
    if (state) {
      // Reference counting supports nested dialogs without prematurely restoring the background.
      state.count += 1;
      return;
    }
    // Preserve pre-existing accessibility state for exact restoration on final release.
    inertStates.set(element, {
      count: 1,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden")
    });
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  });
  return () => {
    targets.forEach((element) => {
      const state = inertStates.get(element);
      if (!state) return;
      state.count -= 1;
      if (state.count > 0) return;
      element.inert = state.inert;
      if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", state.ariaHidden);
      inertStates.delete(element);
    });
  };
}
