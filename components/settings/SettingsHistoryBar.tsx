"use client";

import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { ActionButton } from "@/components/ui/controls";
import type { SettingsDestination } from "@/components/settings/settings-model";

export type SettingsBreadcrumb = {
  key: string;
  label: string;
  destination: SettingsDestination;
};

export function SettingsHistoryBar({
  backLabel,
  forwardLabel,
  breadcrumbs,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNavigate
}: {
  backLabel: string;
  forwardLabel: string;
  breadcrumbs: SettingsBreadcrumb[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (destination: SettingsDestination) => void;
}) {
  return (
    <div className="settings-history-bar" data-testid="settings-history-bar">
      <div className="settings-history-bar__buttons">
        <ActionButton
          variant="icon"
          size="sm"
          aria-label={backLabel}
          title={backLabel}
          disabled={!canGoBack}
          onClick={onBack}
          icon={<ArrowLeft className="h-4 w-4" />}
          data-testid="settings-history-back"
        />
        <ActionButton
          variant="icon"
          size="sm"
          aria-label={forwardLabel}
          title={forwardLabel}
          disabled={!canGoForward}
          onClick={onForward}
          icon={<ArrowRight className="h-4 w-4" />}
          data-testid="settings-history-forward"
        />
      </div>
      <nav className="settings-history-bar__path" aria-label={breadcrumbs.map((item) => item.label).join(" / ")}>
        {breadcrumbs.map((item, index) => (
          <span key={item.key} className="settings-history-bar__crumb">
            {index ? <ChevronRight className="app-text-subtle h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
            <button
              type="button"
              onClick={() => onNavigate(item.destination)}
              aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
              className="settings-history-bar__link control-focus"
            >
              {item.label}
            </button>
          </span>
        ))}
      </nav>
    </div>
  );
}
