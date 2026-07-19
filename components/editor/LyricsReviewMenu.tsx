"use client";

import { AlertTriangle, ListChecks, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  formatLyricsWorkspaceCopy,
  type LyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import type {
  LyricsDocumentAnalysis,
  LyricsIssue,
  LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import { cn } from "@/lib/utils";

export function LyricsReviewMenu({
  copy,
  lineStatus,
  analysis,
  onLocate
}: {
  copy: LyricsWorkspaceCopy;
  lineStatus: ExportLyricLineStatus;
  analysis: LyricsDocumentAnalysis;
  onLocate: (editor: LyricsWorkbenchEditor, line: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reviewCount = analysis.issues.length
    + (analysis.lineDifference === 0 ? 0 : 1)
    + (lineStatus.isOverLimit ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function locate(editor: LyricsWorkbenchEditor, line: number) {
    setOpen(false);
    window.requestAnimationFrame(() => onLocate(editor, line));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "app-button lyrics-command-button lyrics-command-button--prominent control-focus relative flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold",
          lineStatus.isOverLimit && "status-danger"
        )}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="lyrics-review-menu"
        title={copy.reviewTab}
        data-testid="lyrics-command-review"
      >
        {reviewCount > 0
          ? <AlertTriangle className="size-3.5" aria-hidden="true" />
          : <ListChecks className="size-3.5" aria-hidden="true" />}
        <span className="hidden min-[1080px]:inline">{copy.reviewTab}</span>
        <span className="font-mono text-[9px] font-bold">
          {lineStatus.totalLineCount}/{lineStatus.maxLineCount}
        </span>
        {reviewCount > 0 ? (
          <span className="flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--control-focus-border)] px-0.5 text-[8px] font-bold text-white">
            {Math.min(99, reviewCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="lyrics-review-menu"
          role="dialog"
          aria-label={copy.reviewHeading}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100vh-12rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--elevated-panel-bg))] p-2.5 shadow-2xl backdrop-blur-xl"
          data-testid="lyrics-review-panel"
        >
          <header className="mb-2 flex items-center justify-between gap-2 border-b border-[rgb(var(--panel-border))] pb-2">
            <h3 className="app-text-primary text-xs font-semibold">{copy.reviewHeading}</h3>
            <button
              type="button"
              className="app-button control-focus flex size-7 items-center justify-center rounded-md"
              onClick={() => {
                setOpen(false);
                window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
              }}
              aria-label={copy.closeDrawer}
              data-testid="lyrics-review-close"
            >
              <X className="size-3.5" />
            </button>
          </header>

          <div
            tabIndex={-1}
            className={cn(
              "control-focus rounded-md border px-2.5 py-2 text-xs leading-relaxed",
              lineStatus.isOverLimit ? "status-danger" : "status-idle"
            )}
            data-testid="lyrics-line-budget"
          >
            <p className="font-semibold">
              {lineStatus.originalLineCount} + {lineStatus.translationLineCount} = {lineStatus.totalLineCount} / {lineStatus.maxLineCount}
            </p>
            <p className="mt-1 text-[10px]">
              {formatLyricsWorkspaceCopy(
                lineStatus.isOverLimit ? copy.budgetExceeded : copy.budgetRemaining,
                { count: lineStatus.isOverLimit ? lineStatus.exceededLineCount : lineStatus.remainingLineCount }
              )}
            </p>
          </div>

          <ReviewSection title={copy.alignmentHeading}>
            {analysis.lineDifference === 0 ? (
              <p className="app-text-subtle text-[11px]">{copy.alignmentOk}</p>
            ) : (
              <ReviewIssueButton
                label={formatLyricsWorkspaceCopy(copy.alignmentMismatch, {
                  count: Math.abs(analysis.lineDifference),
                  line: analysis.firstUnpairedLine ?? 1
                })}
                onClick={() => locate(
                  analysis.lineDifference > 0 ? "lyrics" : "translation",
                  analysis.firstUnpairedLine ?? 1
                )}
                testId="lyrics-review-alignment"
              />
            )}
          </ReviewSection>

          <ReviewSection title={copy.issueHeading}>
            {analysis.issues.length > 0 ? (
              <div className="grid gap-1.5">
                {analysis.issues.slice(0, 24).map((issue) => (
                  <ReviewIssueButton
                    key={issue.id}
                    label={issueLabel(copy, issue)}
                    excerpt={issue.excerpt}
                    onClick={() => locate(issue.editor, issue.line)}
                    testId="lyrics-review-issue"
                  />
                ))}
              </div>
            ) : (
              <p className="app-text-subtle text-[11px] leading-relaxed">{copy.noIssues}</p>
            )}
          </ReviewSection>
        </div>
      ) : null}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-b border-[rgb(var(--panel-border))] py-2.5 last:border-b-0 last:pb-0">
      <h4 className="app-text-primary text-[11px] font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function ReviewIssueButton({
  label,
  excerpt,
  onClick,
  testId
}: {
  label: string;
  excerpt?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="app-button control-focus w-full rounded-md px-2.5 py-2 text-left"
      onClick={onClick}
      data-testid={testId}
    >
      <span className="app-text-primary block text-[10px] font-semibold leading-relaxed">{label}</span>
      {excerpt ? <span className="app-text-subtle mt-1 block truncate font-mono text-[9px]">{excerpt}</span> : null}
    </button>
  );
}

function issueLabel(copy: LyricsWorkspaceCopy, issue: LyricsIssue) {
  const label = issue.editor === "translation" ? copy.translation : copy.original;
  const template = issue.kind === "long-line"
    ? copy.longLineIssue
    : issue.kind === "duplicate-line"
      ? copy.duplicateLineIssue
      : copy.invisibleIssue;
  return formatLyricsWorkspaceCopy(template, {
    label,
    line: issue.line,
    count: issue.count
  });
}
