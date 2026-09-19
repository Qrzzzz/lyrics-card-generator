"use client";

import { Copy, Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/controls";
import { SettingsPageHeading } from "@/components/settings/SettingsLayout";
import { SUPPORT_METHODS } from "@/lib/settings/support-addresses";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import type { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function SupportAuthorSection({ copy }: { copy: typeof settingsCopy[Locale] }) {
  const [methodId, setMethodId] = useState<string>(SUPPORT_METHODS[0].id);
  const [copyState, setCopyState] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const requestId = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
    return () => { requestId.current += 1; };
  }, []);
  const method = SUPPORT_METHODS.find((item) => item.id === methodId) ?? SUPPORT_METHODS[0];

  async function copyAddress() {
    const request = ++requestId.current;
    setCopyState("pending");
    try {
      const desktop = getLyricsCardDesktopApi();
      if (desktop) {
        if (!await desktop.copySupportAddress(method.id)) throw new Error("Address copy failed");
      } else {
        await navigator.clipboard.writeText(method.address);
      }
      if (request === requestId.current) setCopyState("copied");
    } catch {
      if (request === requestId.current) setCopyState("failed");
    }
  }

  return (
    <div ref={pageRef} tabIndex={-1} className="grid gap-6 outline-none" data-testid="support-author-page">
      <SettingsPageHeading icon={<Heart className="h-5 w-5" />} title={copy.supportAuthor} description={copy.supportDescription} />
      <fieldset className="min-w-0">
        <legend className="app-text-primary mb-3 text-sm font-semibold">{copy.supportNetwork}</legend>
        <div className="flex flex-wrap gap-3">
          {SUPPORT_METHODS.map((item) => (
            <label key={item.id} className="app-button flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-4 py-3">
              <input type="radio" name="support-network" value={item.id} checked={method.id === item.id}
                className="control-focus h-4 w-4 accent-[rgb(var(--accent))]"
                onChange={() => { requestId.current += 1; setMethodId(item.id); setCopyState("idle"); }} />
              <img src={item.icon} alt="" className="h-6 w-6 rounded bg-white p-0.5" />
              <span className="text-sm font-semibold">{item.asset} · {item.network}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid min-w-0 gap-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center" data-testid="support-payment-details">
        <img src={method.qr} alt={`${copy.supportQr}: ${method.network}`} width={192} height={192}
          className="h-48 w-48 max-w-full rounded-lg bg-white" data-testid="support-qr" />
        <div className="grid min-w-0 gap-4">
          <dl className="grid gap-2 text-sm">
            <div><dt className="app-text-subtle">{copy.supportAsset}</dt><dd className="app-text-primary font-semibold">{method.asset} · {method.standard}</dd></div>
            <div><dt className="app-text-subtle">{copy.supportNetwork}</dt><dd className="app-text-primary font-semibold">{method.network}</dd></div>
            <div>
              <dt className="app-text-subtle">{copy.supportAddress}</dt>
              <dd className="mt-2">
                <code className="support-wallet-address" data-testid="support-address"><span className="support-wallet-address__start">{method.address.slice(0, 6)}</span>{method.address.slice(6, -6)}<span className="support-wallet-address__end">{method.address.slice(-6)}</span></code>
              </dd>
            </div>
          </dl>
          <div>
            <ActionButton variant="default" leftIcon={<Copy className="h-4 w-4" />} disabled={copyState === "pending"}
              data-testid="support-copy-address" onClick={() => void copyAddress()}>{copy.supportCopyAddress}</ActionButton>
            <p role="status" aria-live="polite" className="app-text-subtle mt-2 min-h-5 text-sm" data-testid="support-copy-status">
              {copyState === "copied" ? copy.supportAddressCopied : copyState === "failed" ? copy.supportCopyFailed : ""}
            </p>
          </div>
        </div>
      </div>
      <p className="app-text-subtle text-sm leading-6">{copy.supportNetworkNotice}</p>
      {method.id === "xlayer" ? <p className="app-text-subtle text-sm leading-6">{copy.supportXLayerNotice}</p> : null}
    </div>
  );
}
