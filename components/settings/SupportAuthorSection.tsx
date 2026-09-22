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
    <div ref={pageRef} tabIndex={-1} className="grid gap-5 outline-none" data-testid="support-author-page">
      <SettingsPageHeading
        icon={<Heart className="h-5 w-5" />}
        title={copy.supportAuthor}
        description={copy.supportDescription}
        className="support-page-heading"
      />
      <fieldset className="min-w-0">
        <legend className="app-text-subtle mb-2 text-xs font-semibold">{copy.supportNetwork}</legend>
        <div className="support-method-switch">
          {SUPPORT_METHODS.map((item) => (
            <label key={item.id} className={`support-method-option ${method.id === item.id ? "is-active" : ""}`}>
              <input
                type="radio"
                name="support-network"
                value={item.id}
                checked={method.id === item.id}
                className="sr-only"
                onChange={() => { requestId.current += 1; setMethodId(item.id); setCopyState("idle"); }}
              />
              <img src={item.icon} alt="" className="h-5 w-5 rounded bg-white p-px" />
              <span className="text-sm font-semibold">{item.asset} · {item.network}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="support-payment-details" data-testid="support-payment-details">
        <img
          src={method.qr}
          alt={`${copy.supportQr}: ${method.network}`}
          width={160}
          height={160}
          className="support-payment-qr"
          data-testid="support-qr"
        />
        <div className="grid min-w-0 gap-3">
          <div>
            <p className="app-text-primary text-sm font-semibold">{method.asset} · {method.standard}</p>
            <p className="app-text-subtle mt-0.5 text-xs">{method.network}</p>
          </div>
          <div className="min-w-0">
            <div className="app-text-subtle mb-1.5 text-xs">{copy.supportAddress}</div>
            <code className="support-wallet-address" data-testid="support-address"><span className="support-wallet-address__start">{method.address.slice(0, 6)}</span>{method.address.slice(6, -6)}<span className="support-wallet-address__end">{method.address.slice(-6)}</span></code>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ActionButton variant="default" leftIcon={<Copy className="h-4 w-4" />} disabled={copyState === "pending"}
              data-testid="support-copy-address" onClick={() => void copyAddress()}>{copy.supportCopyAddress}</ActionButton>
            <p role="status" aria-live="polite" className="app-text-subtle min-h-5 text-xs" data-testid="support-copy-status">
              {copyState === "copied" ? copy.supportAddressCopied : copyState === "failed" ? copy.supportCopyFailed : ""}
            </p>
          </div>
        </div>
      </div>
      <div className="support-notes">
        <p>{copy.supportNetworkNotice}</p>
        {method.id === "xlayer" ? <p>{copy.supportXLayerNotice}</p> : null}
      </div>
    </div>
  );
}
