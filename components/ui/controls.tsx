"use client";

import { motion } from "framer-motion";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactElement,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { Children, cloneElement, isValidElement, useId, useRef } from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import {
  controlHoverTarget,
  controlTapTarget,
  motionSprings,
  reducedMotionTransition,
  subtleControlTapTarget
} from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

type MotionSafeButtonAttributes = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onDrag"
  | "onDragEnd"
  | "onDragEnter"
  | "onDragExit"
  | "onDragLeave"
  | "onDragOver"
  | "onDragStart"
  | "onDrop"
>;

type FieldLabelProps = {
  label: ReactNode;
  hint?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
};

const fieldShellClass =
  "field-shell control-focus control-disabled w-full rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-55 read-only:opacity-80";

type LabelableFieldProps = {
  id?: string;
  "aria-describedby"?: string;
};

function isLabelableField(child: ReactNode): child is ReactElement<LabelableFieldProps> {
  return (
    isValidElement<LabelableFieldProps>(child) &&
    [TextInput, Input, TextareaField, Textarea, SelectField, Select].includes(
      child.type as typeof TextInput | typeof Input | typeof TextareaField | typeof Textarea | typeof SelectField | typeof Select
    )
  );
}

function mergeAriaIds(...ids: Array<string | undefined>) {
  const resolvedIds = ids.filter(Boolean);
  return resolvedIds.length > 0 ? Array.from(new Set(resolvedIds)).join(" ") : undefined;
}

export function FieldLabel({
  label,
  hint,
  description,
  error,
  disabled = false,
  children,
  className,
  htmlFor
}: FieldLabelProps) {
  const helperText = error ?? description;
  const generatedFieldId = useId();
  const helperTextId = useId();
  const childArray = Children.toArray(children);
  const labelableIndex = childArray.findIndex((child) => isLabelableField(child));
  const labelableChild =
    labelableIndex >= 0 && isLabelableField(childArray[labelableIndex]) ? childArray[labelableIndex] : null;
  const resolvedFieldId = labelableChild
    ? labelableChild.props.id ?? htmlFor ?? generatedFieldId
    : htmlFor;
  const resolvedChildren = labelableChild
    ? childArray.map((child, index) => {
        if (index !== labelableIndex || !isLabelableField(child)) {
          return child;
        }

        return cloneElement(child, {
          id: resolvedFieldId,
          "aria-describedby": mergeAriaIds(child.props["aria-describedby"], helperText ? helperTextId : undefined)
        });
      })
    : children;

  const labelContent = resolvedFieldId ? (
    <label htmlFor={resolvedFieldId} className="app-text-primary font-medium">
      {label}
    </label>
  ) : (
    <span className="app-text-primary font-medium">{label}</span>
  );

  return (
    <div className={cn("app-text-muted grid gap-2 text-sm", disabled ? "opacity-70" : "", className)}>
      <div className="flex items-center justify-between gap-3">
        {labelContent}
        {hint ? <span className="app-text-subtle text-xs">{hint}</span> : null}
      </div>
      {resolvedChildren}
      {helperText ? (
        <div
          id={helperText ? helperTextId : undefined}
          className={cn("text-xs leading-relaxed", error ? "text-amber-200" : "app-text-subtle")}
        >
          {helperText}
        </div>
      ) : null}
    </div>
  );
}

export function Label(props: FieldLabelProps) {
  return <FieldLabel {...props} />;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldShellClass, "h-11 px-3", props.className)} />;
}

export function RangeSlider({
  min = 0,
  max = 100,
  value = 0,
  className,
  style,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const numericMin = Number(min);
  const numericMax = Number(max);
  const numericValue = Number(value);
  const progress =
    Number.isFinite(numericMin) &&
    Number.isFinite(numericMax) &&
    Number.isFinite(numericValue) &&
    numericMax > numericMin
      ? Math.min(100, Math.max(0, ((numericValue - numericMin) / (numericMax - numericMin)) * 100))
      : 0;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      className={cn("range-slider", className)}
      style={{
        ...style,
        "--range-progress": `${progress}%`
      } as CSSProperties}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput {...props} />;
}

export function TextareaField(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldShellClass, "min-h-32 resize-y px-3 py-3", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <TextareaField {...props} />;
}

export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldShellClass, "h-11 px-3", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <SelectField {...props} />;
}

type SectionVariant = "plain" | "card" | "subtle";

type SectionProps = {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  variant?: SectionVariant;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

const sectionVariantClass: Record<SectionVariant, string> = {
  plain: "border-t border-[rgb(var(--panel-border))] pt-4",
  card: "glass-panel rounded-lg p-4",
  subtle: "rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3"
};

export function Section({
  title,
  description,
  variant = "plain",
  children,
  className,
  contentClassName
}: SectionProps) {
  return (
    <section className={cn(sectionVariantClass[variant], className)}>
      <div className="mb-4">
        <h2 className="app-text-primary text-base font-semibold">{title}</h2>
        {description ? <p className="app-text-subtle mt-1 text-sm leading-6">{description}</p> : null}
      </div>
      <div className={cn("grid gap-4", contentClassName)}>{children}</div>
    </section>
  );
}

type SettingRowProps = {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
  className?: string;
};

export function SettingRow({
  label,
  description,
  children,
  align = "center",
  className
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "grid gap-3 border-b border-[rgb(var(--panel-border))] py-3 last:border-b-0",
        "sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)]",
        align === "center" ? "items-center" : "items-start",
        className
      )}
    >
      <div className="min-w-0">
        <div className="app-text-primary text-sm font-medium">{label}</div>
        {description ? <div className="app-text-subtle mt-1 text-xs leading-5">{description}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type ToggleRowProps = {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  testId?: string;
  className?: string;
};

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  size = "md",
  testId,
  className
}: ToggleRowProps) {
  const descriptionId = useId();
  const reduceMotion = useAppReducedMotion();
  const hoverMotion = disabled || reduceMotion ? undefined : controlHoverTarget;
  const pressMotion = disabled || reduceMotion ? undefined : subtleControlTapTarget;

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      whileHover={hoverMotion}
      whileTap={pressMotion}
      transition={reduceMotion ? reducedMotionTransition : motionSprings.control}
      className={cn(
        "control-focus control-disabled group flex w-full items-center justify-between gap-3 rounded-md border border-transparent border-b-[rgb(var(--panel-border))] px-2 text-left transition hover:bg-[rgb(var(--button-bg-hover))] last:border-b-transparent",
        description ? "min-h-14 py-2.5" : size === "sm" ? "h-10 py-2" : "h-11 py-2.5",
        className
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="app-text-primary block text-sm font-medium">{label}</span>
        {description ? (
          <span id={descriptionId} className="app-text-subtle mt-1 block text-xs leading-5">
            {description}
          </span>
        ) : null}
      </span>
      <span className="toggle-track shrink-0" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
    </motion.button>
  );
}

export function SwitchRow(props: ToggleRowProps) {
  return <ToggleRow {...props} />;
}

type ActionButtonVariant = "default" | "primary" | "danger" | "ghost" | "icon";
type ActionButtonSize = "sm" | "md";

type ActionButtonProps = MotionSafeButtonAttributes & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
};

const actionButtonVariantClass: Record<ActionButtonVariant, string> = {
  default: "control-surface",
  primary: "control-variant-primary",
  danger: "control-variant-danger",
  ghost: "control-variant-ghost",
  icon: "control-variant-icon"
};

const actionButtonSizeClass: Record<ActionButtonSize, string> = {
  sm: "h-9 gap-2 px-3 text-sm",
  md: "h-11 gap-2 px-4 text-sm"
};

const actionButtonIconSizeClass: Record<ActionButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11"
};

export function ActionButton({
  variant = "default",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  icon,
  trailingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ActionButtonProps) {
  const isDisabled = disabled || loading;
  const reduceMotion = useAppReducedMotion();
  const hoverMotion = isDisabled || reduceMotion ? undefined : controlHoverTarget;
  const pressMotion = isDisabled || reduceMotion ? undefined : controlTapTarget;
  const resolvedLeftIcon = leftIcon ?? icon;
  const resolvedRightIcon = rightIcon ?? trailingIcon;
  const iconOnly = variant === "icon";

  return (
    <motion.button
      {...props}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileHover={hoverMotion}
      whileTap={pressMotion}
      transition={reduceMotion ? reducedMotionTransition : motionSprings.control}
      className={cn(
        "control-focus control-disabled inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition",
        actionButtonVariantClass[variant],
        iconOnly ? actionButtonIconSizeClass[size] : actionButtonSizeClass[size],
        className
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : resolvedLeftIcon ? (
        <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
          {resolvedLeftIcon}
        </span>
      ) : null}
      {!iconOnly && children ? <span className="min-w-0 truncate">{children}</span> : null}
      {!iconOnly && resolvedRightIcon && !loading ? (
        <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
          {resolvedRightIcon}
        </span>
      ) : null}
    </motion.button>
  );
}

/**
 * Use OptionCard only for visual preset / scheme selection.
 * Do not use it for ordinary scalar settings such as spacing, size, alignment, or toggles.
 */
type OptionCardProps = MotionSafeButtonAttributes & {
  "data-testid"?: string;
  selected?: boolean;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  indicator?: ReactNode;
  showIndicator?: boolean;
  testId?: string;
  buttonRef?: (node: HTMLButtonElement | null) => void;
};

export function OptionCard({
  selected = false,
  label,
  description,
  icon,
  trailing,
  indicator,
  showIndicator,
  testId,
  buttonRef,
  className,
  children,
  type = "button",
  role = "radio",
  disabled = false,
  ...props
}: OptionCardProps) {
  const resolvedTrailing = trailing ?? indicator;
  const resolvedShowIndicator = showIndicator ?? role === "radio";
  const resolvedTestId = testId ?? props["data-testid"];
  const resolvedTabIndex = props.tabIndex ?? (role === "radio" ? (selected ? 0 : -1) : undefined);
  const reduceMotion = useAppReducedMotion();
  const hoverMotion = disabled || reduceMotion ? undefined : controlHoverTarget;
  const pressMotion = disabled || reduceMotion ? undefined : subtleControlTapTarget;

  return (
    <motion.button
      {...props}
      ref={buttonRef}
      type={type}
      role={role}
      aria-checked={role === "radio" ? selected : undefined}
      disabled={disabled}
      data-testid={resolvedTestId}
      data-selected={selected ? "true" : "false"}
      tabIndex={resolvedTabIndex}
      whileHover={hoverMotion}
      whileTap={pressMotion}
      transition={reduceMotion ? reducedMotionTransition : motionSprings.control}
      className={cn(
        "option-card control-focus control-disabled flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left",
        className
      )}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="app-text-primary block text-sm font-medium">{label}</span>
          {description ? <span className="app-text-subtle mt-1 block text-xs leading-5">{description}</span> : null}
          {children}
        </span>
      </span>
      {resolvedTrailing ? (
        <span className="shrink-0" aria-hidden="true">
          {resolvedTrailing}
        </span>
      ) : resolvedShowIndicator ? (
        <span className="option-card__indicator shrink-0" aria-hidden="true" />
      ) : null}
    </motion.button>
  );
}

type OptionCardChoice = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  testId?: string;
  dataStyle?: string;
  dataLocale?: string;
  ariaLabel?: string;
  trailing?: ReactNode;
  indicator?: ReactNode;
  showIndicator?: boolean;
};

type OptionCardGroupProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value?: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  options?: readonly OptionCardChoice[];
  ariaLabel?: string;
  columns?: 1 | 2 | 3;
};

export function OptionCardGroup({
  value,
  onChange,
  onValueChange,
  options,
  ariaLabel,
  columns,
  className,
  children,
  role,
  style,
  ...props
}: OptionCardGroupProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const resolvedRole = role ?? (options || onChange || onValueChange ? "radiogroup" : "group");
  const resolvedOnChange = onChange ?? onValueChange;
  const resolvedColumns = columns;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isForward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const isBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!isForward && !isBackward) {
      return;
    }

    if (options?.length && resolvedOnChange) {
      event.preventDefault();
      const enabledOptions = options.filter((option) => !option.disabled);
      if (enabledOptions.length === 0) {
        return;
      }

      const currentIndex = Math.max(0, enabledOptions.findIndex((option) => option.value === value));
      const nextIndex =
        (currentIndex + (isForward ? 1 : -1) + enabledOptions.length) % enabledOptions.length;
      const nextOption = enabledOptions[nextIndex];
      resolvedOnChange(nextOption.value);
      refs.current[nextOption.value]?.focus();
      return;
    }

    if (resolvedRole !== "radiogroup") {
      return;
    }

    const radioButtons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')
    );
    if (radioButtons.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = Math.max(
      0,
      radioButtons.findIndex(
        (button) => button === document.activeElement || button.getAttribute("aria-checked") === "true"
      )
    );
    const nextIndex = (currentIndex + (isForward ? 1 : -1) + radioButtons.length) % radioButtons.length;
    const nextButton = radioButtons[nextIndex];
    nextButton.click();
    nextButton.focus();
  };

  return (
    <div
      {...props}
      role={resolvedRole}
      aria-label={props["aria-label"] ?? ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("option-card-group grid gap-3", className)}
      style={
        resolvedColumns !== undefined
          ? { ...style, gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))` }
          : style
      }
    >
      {options
        ? options.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              description={option.description}
              icon={option.icon}
              trailing={option.trailing}
              indicator={option.indicator}
              showIndicator={option.showIndicator}
              selected={value === option.value}
              disabled={option.disabled}
              data-testid={option.testId}
              data-style={option.dataStyle}
              data-locale={option.dataLocale}
              aria-label={option.ariaLabel}
              onClick={() => resolvedOnChange?.(option.value)}
              buttonRef={(node) => {
                refs.current[option.value] = node;
              }}
            />
          ))
        : children}
    </div>
  );
}

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
};

type SegmentedControlProps<T extends string = string> = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value: T;
  onChange?: (value: T) => void;
  onValueChange?: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  ariaLabel?: string;
  columns?: 2 | 3 | 4;
  size?: ActionButtonSize;
};

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  onValueChange,
  options,
  ariaLabel,
  columns,
  size = "md",
  className,
  style,
  role,
  ...props
}: SegmentedControlProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const resolvedOnChange = onChange ?? onValueChange;
  const resolvedColumns = columns ?? Math.min(Math.max(options.length, 2), 4);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isForward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const isBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!isForward && !isBackward) {
      return;
    }

    event.preventDefault();
    const enabledOptions = options.filter((option) => !option.disabled);
    if (enabledOptions.length === 0 || !resolvedOnChange) {
      return;
    }

    const currentIndex = Math.max(0, enabledOptions.findIndex((option) => option.value === value));
    const nextIndex =
      (currentIndex + (isForward ? 1 : -1) + enabledOptions.length) % enabledOptions.length;
    const nextOption = enabledOptions[nextIndex];
    resolvedOnChange(nextOption.value);
    refs.current[nextOption.value]?.focus();
  };

  return (
    <div
      {...props}
      role={role ?? "radiogroup"}
      aria-label={props["aria-label"] ?? ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("segmented-control relative isolate grid gap-2 rounded-xl p-1", className)}
      style={{
        ...style,
        "--segmented-count": resolvedColumns,
        "--segmented-active-translate": `${activeIndex * 100}%`,
        gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))`
      } as CSSProperties}
    >
      <span className="segmented-control__active-indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          ref={(node) => {
            refs.current[option.value] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          disabled={option.disabled}
          title={option.title}
          data-segment-value={option.value}
          onClick={() => resolvedOnChange?.(option.value)}
          className={cn(
            "segmented-control__item control-focus control-disabled relative isolate overflow-hidden rounded-lg px-3 font-semibold transition",
            size === "sm" ? "h-9 text-sm" : "h-11 text-sm"
          )}
        >
          <span className="relative z-10">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
