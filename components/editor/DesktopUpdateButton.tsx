"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { LyricsCardDesktopApi } from "@/lib/desktop-api";
import type { DesktopUpdateState } from "@/lib/desktop-update";
import type { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { APP_VERSION } from "@/lib/app-version";
import { updateUiCopy } from "@/lib/update-copy";

export function DesktopUpdateButton({ api, locale, t }: {
  api: LyricsCardDesktopApi; locale: Locale; t: ReturnType<typeof createT>;
}) {
  const [state, setState] = useState<DesktopUpdateState>({ phase: "idle", currentVersion: APP_VERSION });
  const [pending, setPending] = useState(false);
  const copy = updateUiCopy[locale];
  useEffect(() => {
    let disposed = false;
    let receivedEvent = false;
    const unsubscribe = api.onUpdateStateChanged((next) => {
      receivedEvent = true;
      if (!disposed) setState(next);
    });
    void api.getUpdateState().then((next) => {
      if (!disposed && !receivedEvent) setState(next);
    }).catch(() => {
      if (!disposed) setState({ phase: "error", currentVersion: APP_VERSION, error: "network" });
    });
    return () => { disposed = true; unsubscribe(); };
  }, [api]);

  async function invoke(action: () => Promise<DesktopUpdateState>) {
    setPending(true);
    try { setState(await action()); }
    catch { setState((previous) => ({ ...previous, error: "network" })); }
    finally { setPending(false); }
  }

  const working = ["checking", "downloading", "installing"].includes(state.phase);
  const status = state.phase === "latest"
    ? t("updateLatestWithVersions", { current: state.currentVersion, latest: state.latestVersion ?? "" })
    : state.phase === "available"
      ? t("updateAvailableWithVersions", { current: state.currentVersion, latest: state.latestVersion ?? "" })
      : state.phase === "downloading" ? copy.downloading.replace("{percent}", String(state.percent ?? 0))
        : state.phase === "downloaded" ? copy.downloaded : state.phase === "installing" ? copy.installing : "";
  const buttonClass = "app-button control-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-65";
  return <div className="grid max-w-full gap-3" data-testid="desktop-update" data-phase={state.phase}>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={buttonClass} disabled={pending || working || state.phase === "downloaded"}
        onClick={() => void invoke(api.checkForUpdates)} data-testid="update-check">
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${state.phase === "checking" ? "animate-spin" : ""}`} />
        {state.phase === "checking" ? t("checkingUpdates") : t("checkUpdates")}
      </button>
      {state.phase === "available" && <button type="button" className={buttonClass} disabled={pending}
        onClick={() => void invoke(api.downloadUpdate)} data-testid="update-download">{copy.download}</button>}
      {state.phase === "downloading" && <button type="button" className={buttonClass}
        onClick={() => void api.cancelUpdate().catch(() => undefined)} data-testid="update-cancel">{copy.cancel}</button>}
      {state.phase === "downloaded" && <button type="button" className={buttonClass} disabled={pending}
        onClick={() => void invoke(api.installUpdate)} data-testid="update-install">{copy.install}</button>}
    </div>
    <div role="status" aria-live="polite" aria-atomic="true" className="app-text-subtle text-sm">
      {status && <p>{status}</p>}
      {state.error && <p>{copy[state.error]}</p>}
    </div>
    {state.phase === "downloading" && <progress className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[rgb(var(--panel-border))] [&::-webkit-progress-value]:bg-[var(--app-accent)]" max={100} value={state.percent ?? 0} aria-label={copy.download} />}
    {state.error && <button type="button" className={`${buttonClass} justify-self-start`}
      onClick={() => void api.openExternal("https://github.com/Qrzzzz/lyrics-card-generator/releases/latest").catch(() => undefined)}>
      {t("openReleasePage")}
    </button>}
  </div>;
}
