"use client";

import { Children, cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from "react";
import { ToggleRow } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

export { SettingsLayout, SettingsGrid } from "@/components/ui/SettingsLayout";

export function SettingsGroup({ title, summary, children, className }: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section className={cn("editor-settings-group", className)} aria-labelledby={titleId}>
      <div className="editor-settings-group__header">
        <h2 id={titleId} className="app-text-primary text-sm font-semibold">{title}</h2>
        {summary ? <span className="app-text-subtle text-xs">{summary}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsField({ label, value, description, children, className }: {
  label: string;
  value?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const descriptionId = useId();
  // Name the control once rather than wrapping it in a second identically named
  // group. This keeps screen-reader output and existing label queries unambiguous.
  const controls = Children.map(children, (child) => {
    if (!isValidElement<{ "aria-label"?: string; "aria-describedby"?: string }>(child)) return child;
    return cloneElement(child, {
      "aria-label": child.props["aria-label"] ?? label,
      "aria-describedby": [child.props["aria-describedby"], description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined
    });
  });
  return (
    <div className={cn("editor-settings-field", className)}>
      <div className="editor-settings-field__header">
        <span className="app-text-primary text-sm font-medium">{label}</span>
        {value !== undefined ? <span className="app-text-subtle text-xs tabular-nums">{value}</span> : null}
      </div>
      {controls}
      {description ? <p id={descriptionId} className="app-text-muted text-xs leading-5">{description}</p> : null}
    </div>
  );
}

/** A switch and its dependent controls stay in the same grid cell and DOM order. */
export function SettingsToggle({ children, ...props }: ComponentProps<typeof ToggleRow> & { children?: ReactNode }) {
  return (
    <div className="editor-settings-field editor-settings-toggle">
      <ToggleRow {...props} />
      {children}
    </div>
  );
}
