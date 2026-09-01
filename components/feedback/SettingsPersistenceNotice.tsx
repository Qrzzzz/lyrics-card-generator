"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionButton } from "@/components/ui/controls";
import type {
  SettingsPersistenceIssue,
  SettingsPersistenceSource
} from "@/lib/settings/persistence-issue";

export function SettingsPersistenceNotice({
  issues
}: {
  issues: Partial<Record<SettingsPersistenceSource, SettingsPersistenceIssue>>;
}) {
  const [retrying, setRetrying] = useState<SettingsPersistenceSource | null>(null);
  const entries = Object.entries(issues) as Array<[SettingsPersistenceSource, SettingsPersistenceIssue]>;
  if (entries.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[135] flex flex-col items-center gap-2 px-4"
      data-testid="settings-persistence-notices"
    >
      {entries.map(([source, issue]) => (
        <div
          key={source}
          role="alert"
          data-persistence-source={source}
          className="status-danger pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm leading-5">{issue.message}</p>
          <ActionButton
            variant="default"
            size="sm"
            loading={retrying === source}
            onClick={() => {
              setRetrying(source);
              void issue.retry()
                .catch(() => undefined)
                .finally(() => setRetrying((current) => current === source ? null : current));
            }}
          >
            {issue.retryLabel}
          </ActionButton>
        </div>
      ))}
    </div>
  );
}
