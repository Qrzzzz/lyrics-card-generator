"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import type { UpdateResult } from "@/lib/github-update";
import type { createT } from "@/lib/i18n";
import { getUpdateLink } from "@/lib/update-link";

type UpdateButtonProps = {
  t: ReturnType<typeof createT>;
};

export function UpdateButton({ t }: UpdateButtonProps) {
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function checkForUpdates() {
    if (isChecking) {
      return;
    }

    setIsChecking(true);
    setResult(null);

    try {
      const response = await fetch("/api/check-update", { method: "GET" });
      const payload = (await response.json()) as UpdateResult;
      setResult(payload);
    } catch (error) {
      setResult({
        status: "error",
        code: "network_error",
        currentVersion: "unknown",
        message: t("updateFailed"),
        details: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsChecking(false);
    }
  }

  const message = result ? getUpdateMessage(result, t) : "";
  const link = result ? getUpdateLink(result) : "";

  async function openLink(url: string) {
    const desktopApi = getLyricsCardDesktopApi();
    if (desktopApi) {
      await desktopApi.openExternal(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

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
            <button
              type="button"
              onClick={() => void openLink(link)}
              className="app-button inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition"
            >
              {t("openReleasePage")}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getUpdateMessage(result: UpdateResult, t: ReturnType<typeof createT>) {
  if (result.status === "latest") {
    return t("updateLatestWithVersions", { current: result.currentVersion, latest: result.latestVersion });
  }

  if (result.status === "update-available") {
    return t("updateAvailableWithVersions", { current: result.currentVersion, latest: result.latestVersion });
  }

  if (result.status === "no-release") {
    return t("updateNoRelease");
  }

  return t("updateFailed");
}

