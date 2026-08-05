"use client";

import { motion, type Transition } from "framer-motion";
import {
  FileAudio,
  FolderOpen,
  History,
  Image as ImageIcon,
  Link2,
  Loader2,
  RotateCcw,
  Save,
  Search,
  SearchCheck,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCloseButton } from "@/components/layout/SurfaceCloseButton";
import { ActionButton, SelectField, TextInput } from "@/components/ui/controls";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import {
  formatImportHistoryText,
  importHistoryCopy
} from "@/lib/import-history-copy";
import type {
  ImportHistoryKind,
  ImportHistoryRecord,
  ImportHistoryReplayUiResult
} from "@/lib/import-history";
import { LOCALE_BCP47 } from "@/lib/locale-language";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

const PAGE_SIZE = 24;

type HistoryFloorProps = {
  isActive: boolean;
  locale: Locale;
  transition: Transition;
  reduceMotion: boolean;
  onClose: () => void;
  onReplay: (recordId: string, relocate?: boolean) => Promise<ImportHistoryReplayUiResult>;
  onNotify: (message: string) => void;
  onRecordRemoved: (recordId: string) => void;
  onHistoryCleared: () => void;
};

export function HistoryFloor({
  isActive,
  locale,
  transition,
  reduceMotion,
  onClose,
  onReplay,
  onNotify,
  onRecordRemoved,
  onHistoryCleared
}: HistoryFloorProps) {
  const copy = importHistoryCopy[locale];
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestIdRef = useRef(0);
  const [records, setRecords] = useState<ImportHistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ImportHistoryKind | "all">("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [missingIds, setMissingIds] = useState<Set<string>>(() => new Set());
  const [exitingVisible, setExitingVisible] = useState(false);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    dateStyle: "medium",
    timeStyle: "short"
  }), [locale]);

  useEffect(() => {
    if (!isActive) return;
    setExitingVisible(true);
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || busyId) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busyId, isActive, onClose]);

  useEffect(() => {
    if (!isActive) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setLoadingMore(false);
    setError("");
    const timer = window.setTimeout(() => {
      void loadFirstPage(requestId);
    }, query ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [isActive, query, source]);

  async function loadFirstPage(scheduledRequestId?: number) {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop) return;
    const requestId = scheduledRequestId ?? requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const result = await desktop.listImportHistory({
        offset: 0,
        limit: PAGE_SIZE,
        query,
        source
      });
      if (requestId !== requestIdRef.current) return;
      setRecords(result.records);
      setTotal(result.total);
      setMissingIds(new Set());
      if (result.notice?.code === "corrupt_recovered") {
        onNotify(formatImportHistoryText(copy.corruptRecovered, {
          file: result.notice.backupFileName || "import-history.corrupt.json"
        }));
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setError(copy.loadFailed);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  async function loadMore() {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop || loadingMore || records.length >= total) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    try {
      const result = await desktop.listImportHistory({
        offset: records.length,
        limit: PAGE_SIZE,
        query,
        source
      });
      if (requestId !== requestIdRef.current) return;
      setRecords((current) => {
        const known = new Set(current.map((record) => record.id));
        return [...current, ...result.records.filter((record) => !known.has(record.id))];
      });
      setTotal(result.total);
    } catch {
      if (requestId === requestIdRef.current) {
        setError(copy.loadFailed);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  }

  async function replay(recordId: string, relocate = false) {
    if (busyId) return;
    setBusyId(recordId);
    const result = await onReplay(recordId, relocate);
    if (result.status === "missing") {
      setMissingIds((current) => new Set(current).add(recordId));
    } else if (result.status === "success") {
      setMissingIds((current) => {
        const next = new Set(current);
        next.delete(recordId);
        return next;
      });
    }
    setBusyId("");
  }

  async function removeRecord(recordId: string) {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop || busyId) return;
    setBusyId(recordId);
    try {
      if (await desktop.removeImportHistory(recordId)) {
        const nextRecords = records.filter((record) => record.id !== recordId);
        setRecords(nextRecords);
        setTotal((current) => Math.max(0, current - 1));
        setMissingIds((current) => {
          const next = new Set(current);
          next.delete(recordId);
          return next;
        });
        onNotify(copy.removed);
        onRecordRemoved(recordId);
        if (nextRecords.length === 0 && total > 1) void loadFirstPage();
      }
    } catch {
      setError(copy.loadFailed);
    } finally {
      setBusyId("");
    }
  }

  async function clearHistory() {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop || busyId || total === 0 || !window.confirm(copy.clearConfirm)) return;
    setBusyId("__all__");
    try {
      await desktop.clearImportHistory();
      setRecords([]);
      setTotal(0);
      setMissingIds(new Set());
      onNotify(copy.cleared);
      onHistoryCleared();
    } catch {
      setError(copy.loadFailed);
    } finally {
      setBusyId("");
    }
  }

  const emptyMessage = query.trim() || source !== "all" ? copy.emptyFiltered : copy.empty;

  return (
    <motion.section
      data-testid="history-surface"
      data-surface-state={isActive ? "open" : "closed"}
      aria-hidden={!isActive}
      aria-labelledby="history-floor-title"
      hidden={!isActive && !exitingVisible}
      className={[
        "history-floor absolute inset-0 z-20 flex min-w-0 flex-col overflow-hidden",
        isActive ? "pointer-events-auto" : "pointer-events-none"
      ].join(" ")}
      animate={{
        y: reduceMotion ? "0%" : isActive ? "0%" : "-100%",
        opacity: isActive ? 1 : 0
      }}
      initial={false}
      inert={!isActive ? true : undefined}
      transition={transition}
      onAnimationComplete={() => {
        if (!isActive) setExitingVisible(false);
      }}
    >
      <header className="settings-wing__header history-wing__header relative z-20">
        <div className="settings-wing__identity min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="settings-wing__icon" aria-hidden="true">
              <History className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 id="history-floor-title" className="app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl">
                {copy.title}
              </h1>
              <p className="app-text-subtle mt-1 hidden max-w-2xl truncate text-sm md:block">{copy.intro}</p>
            </div>
          </div>
        </div>
        <div className="settings-wing__actions flex shrink-0 items-center gap-2 sm:gap-3">
          <SurfaceCloseButton
            buttonRef={closeButtonRef}
            label={settingsCopy[locale].close}
            testId="history-close-button"
            onClick={onClose}
            disabled={Boolean(busyId)}
          />
        </div>
        <div className="history-wing__controls">
          <label className="history-search-field">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{copy.searchPlaceholder}</span>
            <TextInput
              value={query}
              data-testid="history-search"
              placeholder={copy.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="history-source-filter">
            <span className="sr-only">{copy.filterLabel}</span>
            <SelectField
              value={source}
              data-testid="history-source-filter"
              aria-label={copy.filterLabel}
              onChange={(event) => setSource(event.target.value as ImportHistoryKind | "all")}
            >
              <option value="all">{copy.allSources}</option>
              <option value="link">{copy.sourceLink}</option>
              <option value="search">{copy.sourceSearch}</option>
              <option value="local-audio">{copy.sourceLocalAudio}</option>
              <option value="manual-cover">{copy.sourceManualCover}</option>
              <option value="manual-save">{copy.sourceManualSave}</option>
            </SelectField>
          </label>
          <span className="app-text-subtle shrink-0 text-xs" aria-live="polite">
            {formatImportHistoryText(copy.resultCount, { count: total })}
          </span>
          <ActionButton
            variant="danger"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            data-testid="history-clear-all"
            disabled={total === 0 || Boolean(busyId)}
            onClick={() => void clearHistory()}
          >
            {copy.clearAll}
          </ActionButton>
        </div>
      </header>

      <div className="history-floor__content-scroll relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1520px] px-4 pb-6 pt-4 sm:px-6 sm:pt-6">
          {loading ? (
            <HistoryState icon={<Loader2 className="h-5 w-5 animate-spin" />} message={copy.loading} testId="history-loading" />
          ) : error ? (
            <div className="grid justify-items-center gap-3 py-16 text-center" role="alert" data-testid="history-error">
              <p className="status-danger rounded-xl border px-4 py-3 text-sm">{error}</p>
              <ActionButton size="sm" onClick={() => void loadFirstPage()}>{copy.retry}</ActionButton>
            </div>
          ) : records.length === 0 ? (
            <HistoryState icon={<SearchCheck className="h-6 w-6" />} message={emptyMessage} testId="history-empty" />
          ) : (
            <>
              <div className="history-grid" data-testid="history-grid">
                {records.map((record) => (
                  <HistoryCard
                    key={record.id}
                    record={record}
                    locale={locale}
                    dateFormatter={dateFormatter}
                    busy={busyId === record.id}
                    missing={missingIds.has(record.id)}
                    onReplay={() => void replay(record.id)}
                    onRelocate={() => void replay(record.id, true)}
                    onRemove={() => void removeRecord(record.id)}
                  />
                ))}
              </div>
              {records.length < total ? (
                <div className="mt-6 flex justify-center">
                  <ActionButton
                    loading={loadingMore}
                    data-testid="history-load-more"
                    onClick={() => void loadMore()}
                  >
                    {copy.loadMore}
                  </ActionButton>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function HistoryCard({
  record,
  locale,
  dateFormatter,
  busy,
  missing,
  onReplay,
  onRelocate,
  onRemove
}: {
  record: ImportHistoryRecord;
  locale: Locale;
  dateFormatter: Intl.DateTimeFormat;
  busy: boolean;
  missing: boolean;
  onReplay: () => void;
  onRelocate: () => void;
  onRemove: () => void;
}) {
  const copy = importHistoryCopy[locale];
  const sourceLabel = sourceLabelForKind(record.kind, locale);
  const title = record.title || record.detail || sourceLabel;
  const SourceIcon = record.kind === "link"
    ? Link2
    : record.kind === "search"
      ? Search
      : record.kind === "local-audio"
        ? FileAudio
        : record.kind === "manual-cover"
          ? ImageIcon
          : Save;
  const ReplayIcon = record.kind === "manual-save" ? Save : RotateCcw;

  return (
    <article
      className="history-card min-w-0"
      data-testid={`history-card-${record.id}`}
      data-history-kind={record.kind}
    >
      <div className="history-card__body grid min-w-0 gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="history-card__icon shrink-0" aria-hidden="true">
            <SourceIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="app-text-primary line-clamp-2 text-lg font-black leading-tight">{title}</h2>
            {record.artist ? <p className="app-text-muted mt-1 truncate text-sm font-medium">{record.artist}</p> : null}
            {record.album ? <p className="app-text-subtle mt-1 truncate text-xs">{record.album}</p> : null}
          </div>
          {record.remoteCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="history-card__cover h-12 w-12 shrink-0 rounded-lg object-cover" src={record.remoteCoverUrl} alt="" />
          ) : null}
        </div>
        <dl className="grid min-w-0 gap-2 text-xs">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <dt className="app-text-subtle shrink-0">{copy.filterLabel}</dt>
            <dd className="app-text-muted truncate text-right font-semibold">{sourceLabel} · {record.source}</dd>
          </div>
          {record.detail ? (
            <div className="min-w-0">
              <dd className="app-text-muted truncate text-right" title={record.detail}>{record.detail}</dd>
            </div>
          ) : null}
        </dl>
        <time className="app-text-subtle text-xs" dateTime={new Date(record.importedAt).toISOString()}>
          {formatImportHistoryText(record.kind === "manual-save" ? copy.savedAt : copy.importedAt, {
            time: dateFormatter.format(record.importedAt)
          })}
        </time>
        {missing ? (
          <p className="status-warning rounded-lg border px-3 py-2 text-xs" role="status">{copy.fileMissing}</p>
        ) : null}
      </div>
      <div className="history-card__actions flex flex-wrap justify-end gap-2 border-t border-[rgb(var(--panel-border))] p-3">
        {missing ? (
          <ActionButton
            size="sm"
            icon={<FolderOpen className="h-4 w-4" />}
            data-testid={`history-relocate-${record.id}`}
            disabled={busy}
            onClick={onRelocate}
          >
            {copy.relocate}
          </ActionButton>
        ) : null}
        <ActionButton
          size="sm"
          icon={<ReplayIcon className="h-4 w-4" />}
          data-testid={`history-replay-${record.id}`}
          loading={busy}
          onClick={onReplay}
        >
          {record.kind === "manual-save"
            ? busy ? copy.loadingManualSave : copy.loadManualSave
            : busy ? copy.reimporting : copy.reimport}
        </ActionButton>
        <ActionButton
          size="sm"
          variant="danger"
          icon={<Trash2 className="h-4 w-4" />}
          data-testid={`history-remove-${record.id}`}
          disabled={busy}
          onClick={onRemove}
        >
          {copy.remove}
        </ActionButton>
      </div>
    </article>
  );
}

function HistoryState({ icon, message, testId }: { icon: React.ReactNode; message: string; testId: string }) {
  return (
    <div className="app-text-subtle grid justify-items-center gap-3 py-20 text-center" data-testid={testId}>
      <span className="settings-wing__icon" aria-hidden="true">{icon}</span>
      <p className="max-w-lg text-sm">{message}</p>
    </div>
  );
}

function sourceLabelForKind(kind: ImportHistoryKind, locale: Locale) {
  const copy = importHistoryCopy[locale];
  if (kind === "link") return copy.sourceLink;
  if (kind === "search") return copy.sourceSearch;
  if (kind === "local-audio") return copy.sourceLocalAudio;
  if (kind === "manual-cover") return copy.sourceManualCover;
  return copy.sourceManualSave;
}
