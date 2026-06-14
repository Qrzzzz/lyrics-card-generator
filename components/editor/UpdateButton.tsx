"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { checkGitHubUpdate, type UpdateCheckResult } from "@/lib/github-update";
import type { createT } from "@/lib/i18n";

type UpdateButtonProps = {
  t: ReturnType<typeof createT>;
};

export function UpdateButton({ t }: UpdateButtonProps) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function checkForUpdates() {
    if (isChecking) {
      return;
    }

    setIsChecking(true);
    setResult(null);

    try {
      setResult(await checkGitHubUpdate());
    } finally {
      setIsChecking(false);
    }
  }

  const message = result ? getUpdateMessage(result, t) : "";
  const link = result && "downloadUrl" in result ? result.downloadUrl : "";

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={checkForUpdates}
        disabled={isChecking}
        className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-65"
      >
        <RefreshCw className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
        {isChecking ? t("checkingUpdates") : t("checkUpdates")}
      </button>

      {message ? (
        <div className="app-text-subtle flex max-w-full flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span>{message}</span>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="app-button inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition"
            >
              {t("openReleasePage")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getUpdateMessage(result: UpdateCheckResult, t: ReturnType<typeof createT>) {
  if (result.status === "latest") {
    return t("updateLatest");
  }

  if (result.status === "update-available") {
    return t("updateAvailable", { version: result.tagName });
  }

  if (result.status === "unknown-version") {
    return t("updateUnknownVersion", { version: result.tagName });
  }

  if (result.status === "no-release") {
    return t("updateNoRelease");
  }

  return t("updateFailed");
}
