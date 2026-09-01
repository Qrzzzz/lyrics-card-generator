import { cn } from "@/lib/utils";

export function SettingsPageHeading({
  icon,
  title,
  description,
  className,
  testId
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)} data-testid={testId}>
      <span className="app-text-primary mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--panel-border))] bg-white/5">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="app-text-primary text-lg font-bold tracking-tight">{title}</h2>
        <p className="app-text-muted mt-1 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function SettingsSectionHeader({
  title,
  description,
  className
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <header className={cn("settings-section-header", className)}>
      <h2 className="app-text-primary text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
      <p className="app-text-subtle mt-2 max-w-3xl text-sm leading-6">{description}</p>
    </header>
  );
}

export function SettingsGroup({
  title,
  description,
  children,
  className
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("settings-group-card", className)}>
      {title || description ? (
        <header className="mb-5 border-b border-[rgb(var(--panel-border))] pb-4">
          {title ? <h3 className="app-text-primary text-base font-bold">{title}</h3> : null}
          {description ? <p className="app-text-subtle mt-1 text-sm leading-6">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  children,
  className
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("settings-row", className)}>
      <div className="min-w-0">
        <div className="app-text-primary text-sm font-semibold">{title}</div>
        {description ? <p className="app-text-subtle mt-1 text-xs leading-5">{description}</p> : null}
      </div>
      <div className="min-w-0 sm:max-w-[60%]">{children}</div>
    </div>
  );
}
