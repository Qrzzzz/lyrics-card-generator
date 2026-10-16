"use client";
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
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LyricsReviewPanel({
  copy,
  lineStatus,
  analysis,
  translationEnabled,
  onLocate
}: {
  copy: LyricsWorkspaceCopy;
  lineStatus: ExportLyricLineStatus;
  analysis: LyricsDocumentAnalysis;
  translationEnabled: boolean;
  onLocate: (editor: LyricsWorkbenchEditor, line: number) => void;
}) {
  return (
    <div data-testid="lyrics-review-panel" className="grid gap-3">
      <div
        tabIndex={-1}
        className={cn(
          "control-focus rounded-md border p-3 text-xs leading-relaxed",
          lineStatus.isOverLimit ? "status-danger" : "status-idle"
        )}
        data-testid="lyrics-line-budget"
      >
        <h3 className="font-semibold">{copy.lineBudgetLabel}</h3>
        <p>
          {lineStatus.originalLineCount} + {lineStatus.translationLineCount} ={" "}
          {lineStatus.totalLineCount} / {lineStatus.maxLineCount}
        </p>
        <p>
          {formatLyricsWorkspaceCopy(
            lineStatus.isOverLimit ? copy.budgetExceeded : copy.budgetRemaining,
            {
              count: lineStatus.isOverLimit
                ? lineStatus.exceededLineCount
                : lineStatus.remainingLineCount
            }
          )}
        </p>
      </div>
      <section
        tabIndex={-1}
        className="control-focus rounded-md"
        data-testid="lyrics-review-alignment-section"
      >
        <ReviewSection title={copy.alignmentHeading}>
          {!translationEnabled ? (
            <p className="app-text-subtle text-xs">{copy.alignmentDisabled}</p>
          ) : analysis.lineDifference === 0 ? (
            <p className="app-text-subtle text-xs">{copy.alignmentOk}</p>
          ) : (
            <ReviewIssueButton
              label={formatLyricsWorkspaceCopy(copy.alignmentMismatch, {
                count: Math.abs(analysis.lineDifference),
                line: analysis.firstUnpairedLine ?? 1
              })}
              onClick={() =>
                onLocate(
                  analysis.lineDifference > 0 ? "lyrics" : "translation",
                  analysis.firstUnpairedLine ?? 1
                )
              }
              testId="lyrics-review-alignment"
            />
          )}
        </ReviewSection>
      </section>
      {(["invisible-character", "duplicate-line", "long-line"] as const).map((kind) => (
        <section
          key={kind}
          tabIndex={-1}
          className="control-focus rounded-md"
          data-testid={"lyrics-review-" + kind}
        >
          <ReviewSection
            title={
              kind === "invisible-character"
                ? copy.invisibleTool
                : kind === "duplicate-line"
                  ? copy.duplicateTool
                  : copy.longLineTool
            }
          >
            <ReviewIssueList copy={copy} issues={analysis.issues.filter(issue => issue.kind === kind)} onLocate={onLocate} />
          </ReviewSection>
        </section>
      ))}
    </div>
  );
}

function ReviewIssueList({ copy, issues, onLocate }: {
  copy: LyricsWorkspaceCopy;
  issues: LyricsIssue[];
  onLocate: (editor: LyricsWorkbenchEditor, line: number) => void;
}) {
  // Keep diagnostics reachable without mounting an unbounded list during edits.
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(issues.length / 100);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const category = issues[0]?.kind === "invisible-character" ? copy.invisibleTool : issues[0]?.kind === "duplicate-line" ? copy.duplicateTool : copy.longLineTool;
  return <>
    {issues.slice(currentPage * 100, (currentPage + 1) * 100).map(issue => <ReviewIssueButton key={issue.id}
      label={issueLabel(copy, issue)} excerpt={issue.excerpt} onClick={() => onLocate(issue.editor, issue.line)} testId="lyrics-review-issue" />)}
    {!issues.length ? <p className="app-text-subtle text-xs">{copy.noIssues}</p> : null}
    {pageCount > 1 ? <nav className="flex items-center justify-between gap-2 text-xs" aria-label={`${copy.issueHeading}: ${category}`}>
      <button type="button" className="app-button control-focus rounded p-2 disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} data-testid="lyrics-review-previous">{copy.previousIssues}</button>
      <span className="app-text-subtle" aria-live="polite">{currentPage + 1} / {pageCount}</span>
      <button type="button" className="app-button control-focus rounded p-2 disabled:opacity-40" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)} data-testid="lyrics-review-next">{copy.nextIssues}</button>
    </nav> : null}
  </>;
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
      <span className="app-text-primary block text-[10px] font-semibold leading-relaxed">
        {label}
      </span>
      {excerpt ? (
        <span className="app-text-subtle mt-1 block truncate font-mono text-[9px]">{excerpt}</span>
      ) : null}
    </button>
  );
}

function issueLabel(copy: LyricsWorkspaceCopy, issue: LyricsIssue) {
  const label = issue.editor === "translation" ? copy.translation : copy.original;
  const template =
    issue.kind === "long-line"
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
