import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

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
  const labelContent = htmlFor ? (
    <label htmlFor={htmlFor} className="app-text-primary font-medium">
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
      {children}
      {helperText ? (
        <span className={cn("text-xs leading-relaxed", error ? "text-amber-200" : "app-text-subtle")}>{helperText}</span>
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

export function Section({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel rounded-lg p-4">
      <div className="mb-4">
        {eyebrow ? <p className="app-text-subtle mb-1 text-[11px] uppercase tracking-[0.16em]">{eyebrow}</p> : null}
        <h2 className="app-text-primary text-base font-semibold">{title}</h2>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
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

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        "control-surface control-focus control-disabled flex w-full items-center justify-between gap-3 rounded-lg px-3 text-left",
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
    </button>
  );
}

export function SwitchRow(props: ToggleRowProps) {
  return <ToggleRow {...props} />;
}

type ActionButtonVariant = "default" | "primary" | "danger" | "ghost" | "icon";
type ActionButtonSize = "sm" | "md";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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
  const resolvedLeftIcon = leftIcon ?? icon;
  const resolvedRightIcon = rightIcon ?? trailingIcon;
  const iconOnly = variant === "icon";

  return (
    <button
      {...props}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
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
    </button>
  );
}

type OptionCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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

  return (
    <button
      {...props}
      ref={buttonRef}
      type={type}
      role={role}
      aria-checked={role === "radio" ? selected : undefined}
      disabled={disabled}
      data-testid={testId}
      data-selected={selected ? "true" : "false"}
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
    </button>
  );
}

type OptionCardChoice = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
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
  const resolvedColumns = columns ?? (options && options.length >= 2 ? 2 : 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!options?.length || !resolvedOnChange) {
      return;
    }

    const isForward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const isBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!isForward && !isBackward) {
      return;
    }

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
  };

  return (
    <div
      {...props}
      role={resolvedRole}
      aria-label={props["aria-label"] ?? ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("option-card-group grid gap-3", className)}
      style={
        resolvedColumns > 1
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
              selected={value === option.value}
              disabled={option.disabled}
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
      className={cn("segmented-control grid gap-2 rounded-xl p-1", className)}
      style={{ ...style, gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          ref={(node) => {
            refs.current[option.value] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          title={option.title}
          data-segment-value={option.value}
          onClick={() => resolvedOnChange?.(option.value)}
          className={cn(
            "segmented-control__item control-focus control-disabled rounded-lg px-3 font-semibold transition",
            size === "sm" ? "h-9 text-sm" : "h-11 text-sm"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
