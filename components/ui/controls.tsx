import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="app-text-muted grid gap-2 text-sm">
      <span className="flex items-center justify-between gap-3">
        <span className="app-text-primary font-medium">{label}</span>
        {hint ? <span className="app-text-subtle text-xs">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field-shell h-11 w-full rounded-lg px-3 text-sm", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn("field-shell min-h-32 w-full resize-y rounded-lg px-3 py-3 text-sm", props.className)}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("field-shell h-11 w-full rounded-lg px-3 text-sm", props.className)} />;
}

export function Section({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
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

export function SwitchRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="app-button flex h-11 items-center justify-between rounded-lg px-3 text-left text-sm"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full border transition",
          checked ? "border-cyan-200/50 bg-cyan-300/30" : "border-white/14 bg-black/30"
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition",
            checked ? "left-6" : "left-1"
          )}
        />
      </span>
    </button>
  );
}
