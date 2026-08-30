"use client";

import { AlertTriangle, X } from "lucide-react";
import type { createT } from "@/lib/i18n";

export type LandscapeLineLimitNotice = {
  revision: number;
  total: number;
  max: number;
};

export function LandscapeLineLimitAlert({
  notice,
  onDismiss,
  t
}: {
  notice: LandscapeLineLimitNotice | null;
  onDismiss: () => void;
  t: ReturnType<typeof createT>;
}) {
  if (!notice) return null;

  return (
    <div
      className="status-warning mb-2 flex shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-relaxed"
      role="alert"
      aria-atomic="true"
      data-testid="landscape-line-limit-alert"
      data-notice-revision={notice.revision}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("landscapeLineLimitTitle", { max: notice.max })}</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          {t("landscapeLineLimitDetail", { total: notice.total })}
        </p>
      </div>
      <button
        type="button"
        className="control-focus -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md transition hover:bg-black/10"
        onClick={onDismiss}
        aria-label={t("dismissNotice")}
        data-testid="landscape-line-limit-dismiss"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
