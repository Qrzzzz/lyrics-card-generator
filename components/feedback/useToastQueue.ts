"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  enqueueToastNotice,
  expireToastNotices,
  getVisibleToastNotices,
  pauseToastNotices,
  promotePendingToastNotices,
  resumeToastNotices,
  TOAST_STACK_CAPACITY_NARROW,
  TOAST_STACK_CAPACITY_WIDE,
  type ToastAnnouncement,
  type ToastNotice,
  type ToastNotifier
} from "@/components/feedback/toast-queue";

export function useToastQueue(): {
  notices: ToastNotice[];
  announcement: ToastAnnouncement | null;
  notify: ToastNotifier;
} {
  const [queue, setQueue] = useState<ToastNotice[]>([]);
  const [announcement, setAnnouncement] = useState<ToastAnnouncement | null>(null);
  const [capacity, setCapacity] = useState(TOAST_STACK_CAPACITY_WIDE);
  const nextNoticeIdRef = useRef(0);
  const nextAnnouncementIdRef = useRef(0);
  const capacityRef = useRef(capacity);
  const runningRef = useRef(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateCapacity = () => {
      setCapacity(mediaQuery.matches ? TOAST_STACK_CAPACITY_NARROW : TOAST_STACK_CAPACITY_WIDE);
    };
    updateCapacity();
    mediaQuery.addEventListener("change", updateCapacity);
    return () => mediaQuery.removeEventListener("change", updateCapacity);
  }, []);

  useEffect(() => {
    capacityRef.current = capacity;
    setQueue((current) => promotePendingToastNotices(current, Date.now(), capacity, runningRef.current));
  }, [capacity]);

  useEffect(() => {
    function synchronizeVisibility() {
      const running = document.visibilityState !== "hidden";
      if (running === runningRef.current) return;
      runningRef.current = running;
      const now = Date.now();
      setQueue((current) => running
        ? resumeToastNotices(current, now)
        : pauseToastNotices(current, now));
    }

    synchronizeVisibility();
    document.addEventListener("visibilitychange", synchronizeVisibility);
    return () => document.removeEventListener("visibilitychange", synchronizeVisibility);
  }, []);

  useEffect(() => {
    if (!runningRef.current) return;
    const nextExpiry = queue.reduce<number | null>((earliest, notice) => {
      if (notice.stage !== "visible" || notice.expiresAt === null) return earliest;
      return earliest === null ? notice.expiresAt : Math.min(earliest, notice.expiresAt);
    }, null);
    if (nextExpiry === null) return;

    const timer = window.setTimeout(() => {
      setQueue((current) => expireToastNotices(
        current,
        Date.now(),
        capacityRef.current,
        runningRef.current
      ) as ToastNotice[]);
    }, Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [queue]);

  const notify = useCallback<ToastNotifier>((message, tone) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;

    nextNoticeIdRef.current += 1;
    nextAnnouncementIdRef.current += 1;
    const now = Date.now();
    const id = nextNoticeIdRef.current;
    setQueue((current) => enqueueToastNotice(current, {
      id,
      message: normalizedMessage,
      tone,
      now,
      capacity: capacityRef.current,
      running: runningRef.current
    }).notices);
    setAnnouncement({ id: nextAnnouncementIdRef.current, message: normalizedMessage });
  }, []);

  const notices = useMemo(() => getVisibleToastNotices(queue), [queue]);
  return { notices, announcement, notify };
}
