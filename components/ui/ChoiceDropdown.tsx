"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { motionDurations, motionEasings, reducedMotionTransition } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";
import type { SegmentedControlOption } from "./controls";

type ChoiceDropdownProps<T extends string> = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange?: (value: T) => void;
  label?: string;
  size?: "sm" | "md";
};

/** Compact named choice row; its menu escapes scrolling and clipping panels. */
export function ChoiceDropdown<T extends string>({ value, options, onChange, label, size = "md",
  className, style, onKeyDown, ...props }: ChoiceDropdownProps<T>) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [open, setOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const reduceMotion = useAppReducedMotion();
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const enabled = options.filter((option) => !option.disabled);
  const selected = options.find((option) => option.value === value);
  const initialFocus = useRef<T | undefined>(undefined);

  function close(restoreFocus = false) {
    // The exiting menu is decorative and must stop accepting input immediately.
    if (menu.current) {
      menu.current.inert = true;
      menu.current.setAttribute("aria-hidden", "true");
    }
    setExiting(open && !reduceMotion);
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function expand(target?: T) {
    setExiting(false);
    initialFocus.current = target ?? enabled.find((option) => option.value === value)?.value ?? enabled[0]?.value;
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const computed = getComputedStyle(trigger.current);
    const theme: Record<string, string> = {};
    for (let index = 0; index < computed.length; index++) {
      const name = computed[index];
      if (name.startsWith("--")) theme[name] = computed.getPropertyValue(name);
    }
    const width = Math.min(rect.width, window.innerWidth - 24);
    const below = window.innerHeight - rect.top - 12;
    const above = rect.bottom - 12;
    const up = below < Math.min(menu.current?.scrollHeight ?? 180, 300) && above > below;
    setMenuStyle({ ...theme,
      width, transformOrigin: up ? "bottom right" : "top right",
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      maxHeight: Math.min(300, Math.max(44, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - rect.bottom } : { top: rect.top })
    });
    if (initialFocus.current) optionRefs.current[initialFocus.current]?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close();
    };
    const dismissOnScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    const dismissOnResize = () => close();
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", dismissOnScroll, true);
    window.addEventListener("resize", dismissOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("scroll", dismissOnScroll, true);
      window.removeEventListener("resize", dismissOnResize);
    };
  }, [open]);

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      // Restore the trigger before the browser performs its normal Tab traversal.
      close(true);
      return;
    }
    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const current = enabled.findIndex((option) => optionRefs.current[option.value] === document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 :
      (Math.max(0, current) + direction + enabled.length) % enabled.length;
    const next = enabled[index];
    if (next) optionRefs.current[next.value]?.focus();
  }

  return <div {...props} className={cn("choice-dropdown", className)} style={style}
    data-choice-values={options.map((option) => option.value).join(" ")}
    aria-label={undefined} onKeyDown={onKeyDown}>
    {label ? <span id={`${id}-label`} className="app-text-primary choice-dropdown__label">{label}</span> : null}
    <button ref={trigger} type="button" role="combobox" aria-haspopup="listbox"
      aria-labelledby={label ? `${id}-label` : undefined} aria-label={label ? undefined : props["aria-label"]}
      aria-describedby={props["aria-describedby"]} aria-controls={open ? `${id}-menu` : undefined}
      aria-expanded={open} data-menu-visible={open || exiting ? "true" : "false"} disabled={enabled.length === 0}
      data-choice-value={value}
      aria-hidden={open ? true : undefined} tabIndex={open ? -1 : 0}
      className={cn("choice-dropdown__trigger control-focus control-disabled", size === "sm" && "choice-dropdown__trigger--small")}
      onClick={() => open ? close() : expand()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
          event.preventDefault();
          expand(event.key === "Home" ? enabled[0]?.value :
            event.key === "End" || event.key === "ArrowUp" ? enabled.at(-1)?.value : undefined);
        }
      }}>
      <span>{selected?.label ?? enabled[0]?.label}</span>
      <ChevronDown size={16} aria-hidden="true" className={open ? "rotate-180" : undefined} />
    </button>
    {typeof document !== "undefined" ? createPortal(<AnimatePresence onExitComplete={() => setExiting(false)}>
      {open ? <motion.div key="menu" ref={menu} id={`${id}-menu`} role="listbox" aria-label={label} data-choice-menu={options.map((option) => option.value).join(" ")}
      initial={reduceMotion ? false : { opacity: 0, scaleY: 0.94 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={reduceMotion ? { opacity: 0, transition: reducedMotionTransition } : { opacity: 0, scaleY: 0.97, transition: { duration: motionDurations.fast } }}
      transition={reduceMotion ? reducedMotionTransition : { duration: open ? motionDurations.normal : motionDurations.fast, ease: motionEasings.standard }}
      className="choice-dropdown__menu" style={menuStyle} onKeyDown={handleMenuKey}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close();
      }}>
      {options.map((option) => <button key={option.value} type="button" role="option"
        ref={(node) => { optionRefs.current[option.value] = node; }}
        aria-selected={value === option.value} disabled={option.disabled} title={option.title}
        tabIndex={-1} data-segment-value={option.value} className="choice-dropdown__option control-focus control-disabled"
        onClick={() => { onChange?.(option.value); close(true); }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onChange?.(option.value);
          close(true);
        }}>
        <span>{option.label}</span><span className="choice-control__mark" aria-hidden="true" />
      </button>)}
    </motion.div> : null}
    </AnimatePresence>, document.body) : null}
  </div>;
}
