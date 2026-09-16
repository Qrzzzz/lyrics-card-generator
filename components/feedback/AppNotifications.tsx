"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { ActionButton } from "@/components/ui/controls";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "warning" | "error";
  action?: { label: string; run: () => void | Promise<unknown> };
  persistenceSource?: string;
};

/** Callers own the underlying condition; dismissing only hides its notification. */
export function AppNotifications({ notices, closeLabel }: { notices: AppNotification[]; closeLabel: string }) {
  const reduceMotion = useAppReducedMotion();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [top, setTop] = useState(64);
  useEffect(() => {
    const rail = document.querySelector(".lyrics-stepper-rail");
    if (!rail) return;
    const measure = () => setTop(Math.max(64, Math.min(rail.getBoundingClientRect().bottom + 12, window.innerHeight / 2)));
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const activeIds = notices.map((notice) => notice.id).join("\n");
  useEffect(() => {
    const active = new Set(activeIds.split("\n"));
    setDismissed((current) => current.some((id) => !active.has(id)) ? current.filter((id) => active.has(id)) : current);
  }, [activeIds]);
  return (
    <div data-testid="app-notification-stack" style={{ top, maxHeight: `calc(100dvh - ${top + 16}px)` }} className="pointer-events-none fixed right-4 z-[135] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto">
      <MotionPresence initial={false}>
        {notices.filter((notice) => !dismissed.includes(notice.id)).slice(0, 2).map((notice) => (
          <motion.div key={notice.id} initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
            <NotificationCard notice={notice} closeLabel={closeLabel} onDismiss={() => setDismissed((current) => [...current, notice.id])} />
          </motion.div>
        ))}
      </MotionPresence>
    </div>
  );
}

function NotificationCard({ notice, closeLabel, onDismiss }: { notice: AppNotification; closeLabel: string; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section data-testid="app-notification" data-notification-id={notice.id} data-persistence-source={notice.persistenceSource} data-tone={notice.tone}
      className="app-toast pointer-events-auto relative min-w-0 rounded-2xl border p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl">
      <div role={notice.tone === "error" ? "alert" : "status"} aria-atomic="true" className="pr-9">
        <p className="text-sm font-semibold leading-5">{notice.title}</p>
        <p className="mt-1 break-words text-sm leading-6">{notice.message}</p>
      </div>
      <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onDismiss} className="control-focus absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-4" aria-hidden="true" /></button>
      {notice.action ? <div className="mt-3"><ActionButton size="sm" loading={busy} disabled={busy} onClick={() => {
        if (busy) return;
        setBusy(true);
        // Keep failed actions visible; persistence owners retain their error state.
        void Promise.resolve().then(() => notice.action?.run()).then(() => {
          if (notice.tone !== "error") onDismiss();
        }).catch(() => undefined).finally(() => setBusy(false));
      }}>{notice.action.label}</ActionButton></div> : null}
    </section>
  );
}
