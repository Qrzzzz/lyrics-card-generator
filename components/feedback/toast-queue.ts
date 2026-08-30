export type ToastTone = "success" | "warning" | "error";

export type ToastNotifier = (message: string, tone: ToastTone) => void;

export type ToastNotice = {
  id: number;
  message: string;
  tone: ToastTone;
  revision: number;
  durationMs: number;
  remainingMs: number;
  expiresAt: number | null;
  stage: "visible" | "pending";
};

export type ToastAnnouncement = {
  id: number;
  message: string;
};

export const TOAST_STACK_CAPACITY_NARROW = 3;
export const TOAST_STACK_CAPACITY_WIDE = 5;

const FULL_WIDTH_READING_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const COMPACT_READING_CHARACTER = /[\p{L}\p{N}]/u;

const durationRules: Record<ToastTone, { base: number; min: number; max: number }> = {
  success: { base: 2800, min: 2800, max: 5200 },
  warning: { base: 3600, min: 3800, max: 8000 },
  error: { base: 4000, min: 4200, max: 8000 }
};

export function getToastDurationMs(message: string, tone: ToastTone) {
  const normalizedMessage = message.normalize("NFC").trim();
  const readingUnits = Array.from(normalizedMessage).reduce((total, character) => {
    if (/\s/u.test(character)) return total;
    if (FULL_WIDTH_READING_CHARACTER.test(character)) return total + 1;
    if (COMPACT_READING_CHARACTER.test(character)) return total + 0.45;
    return total + 0.25;
  }, 0);
  const rule = durationRules[tone];
  const estimated = rule.base + Math.max(0, readingUnits - 6) * 55;
  const clamped = Math.min(rule.max, Math.max(rule.min, estimated));
  return Math.round(clamped / 100) * 100;
}

export function enqueueToastNotice(
  notices: readonly ToastNotice[],
  input: {
    id: number;
    message: string;
    tone: ToastTone;
    now: number;
    capacity: number;
    running: boolean;
    durationMs?: number;
  }
) {
  const message = input.message.trim();
  const durationMs = input.durationMs ?? getToastDurationMs(message, input.tone);
  const existingIndex = notices.findIndex((notice) => notice.message === message && notice.tone === input.tone);

  if (existingIndex >= 0) {
    const existing = notices[existingIndex];
    const refreshed: ToastNotice = {
      ...existing,
      revision: existing.revision + 1,
      durationMs,
      remainingMs: durationMs,
      expiresAt: existing.stage === "visible" && input.running ? input.now + durationMs : null
    };
    const next = [...notices];
    next[existingIndex] = refreshed;
    return { notices: next, repeated: true, noticeId: existing.id };
  }

  const stage = notices.filter((notice) => notice.stage === "visible").length < input.capacity
    ? "visible"
    : "pending";
  const notice: ToastNotice = {
    id: input.id,
    message,
    tone: input.tone,
    revision: 0,
    durationMs,
    remainingMs: durationMs,
    expiresAt: stage === "visible" && input.running ? input.now + durationMs : null,
    stage
  };

  return { notices: [...notices, notice], repeated: false, noticeId: notice.id };
}

export function expireToastNotices(
  notices: readonly ToastNotice[],
  now: number,
  capacity: number,
  running: boolean
) {
  if (!running) return [...notices];
  const retained = notices.filter((notice) => (
    notice.stage !== "visible" || notice.expiresAt === null || notice.expiresAt > now
  ));
  if (retained.length === notices.length) return [...notices];
  return promotePendingToastNotices(retained, now, capacity, running);
}

export function promotePendingToastNotices(
  notices: readonly ToastNotice[],
  now: number,
  capacity: number,
  running: boolean
) {
  let availableSlots = Math.max(
    0,
    capacity - notices.filter((notice) => notice.stage === "visible").length
  );
  if (availableSlots === 0) return [...notices];

  return notices.map((notice) => {
    if (notice.stage !== "pending" || availableSlots === 0) return notice;
    availableSlots -= 1;
    return {
      ...notice,
      stage: "visible" as const,
      remainingMs: notice.durationMs,
      expiresAt: running ? now + notice.durationMs : null
    };
  });
}

export function pauseToastNotices(notices: readonly ToastNotice[], now: number) {
  return notices.map((notice) => {
    if (notice.stage !== "visible" || notice.expiresAt === null) return notice;
    return {
      ...notice,
      remainingMs: Math.max(0, notice.expiresAt - now),
      expiresAt: null
    };
  });
}

export function resumeToastNotices(notices: readonly ToastNotice[], now: number) {
  return notices.map((notice) => {
    if (notice.stage !== "visible" || notice.expiresAt !== null) return notice;
    return {
      ...notice,
      expiresAt: now + notice.remainingMs
    };
  });
}

export function getVisibleToastNotices(notices: readonly ToastNotice[]) {
  return notices.filter((notice) => notice.stage === "visible");
}
