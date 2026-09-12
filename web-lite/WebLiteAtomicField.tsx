"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BetweenHorizontalStart } from "lucide-react";
import { AtomicLyricsTextarea } from "@/components/editor/AtomicLyricsTextarea";
import { ActionButton } from "@/components/ui/controls";
import { insertSeparator, type TextRange } from "@/lib/lyric-separator";
import { separatorCopy } from "@/lib/lyric-separator-copy";
import type { Locale } from "@/lib/types";

type Entry = { text: string; selection: TextRange };

export function WebLiteAtomicField({ id, value, onChange, placeholder, locale, testId, className }: {
  id: string; value: string; onChange: (text: string) => void; placeholder: string;
  locale: Locale; testId: string; className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const expected = useRef(value);
  const pending = useRef<TextRange | null>(null);
  const [history, setHistory] = useState<{ past: Entry[]; future: Entry[] }>({ past: [], future: [] });

  useLayoutEffect(() => {
    if (expected.current !== value) {
      expected.current = value;
      setHistory({ past: [], future: [] });
      pending.current = null;
    }
    if (pending.current && ref.current) {
      if (document.activeElement !== ref.current) ref.current.focus({ preventScroll: true });
      if (ref.current.selectionStart !== pending.current.start || ref.current.selectionEnd !== pending.current.end) {
        ref.current.setSelectionRange(pending.current.start, pending.current.end);
      }
      pending.current = null;
    }
  }, [value]);

  function current(): Entry {
    return { text: value, selection: { start: ref.current?.selectionStart ?? 0, end: ref.current?.selectionEnd ?? 0 } };
  }
  function publish(entry: Entry) {
    expected.current = entry.text;
    pending.current = entry.selection;
    onChange(entry.text);
  }
  function commit(entry: Entry) {
    if (entry.text === value) return;
    setHistory((state) => ({ past: [...state.past, current()].slice(-80), future: [] }));
    publish(entry);
  }
  return (
    <div className="grid gap-2">
      <div className="relative min-w-0">
        <AtomicLyricsTextarea
          ref={ref} id={id} value={value} placeholder={placeholder}
          className={`field-shell control-focus block w-full min-w-0 resize-y rounded-lg border px-3 py-3 text-sm ${className}`}
          data-testid={testId} separatorHint={separatorCopy[locale].tooltip}
          canUndo={history.past.length > 0} canRedo={history.future.length > 0}
          onChange={(event) => commit({ text: event.currentTarget.value,
            selection: { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd } })}
          onUndo={() => {
            const entry = history.past.at(-1);
            if (!entry) return;
            setHistory({ past: history.past.slice(0, -1), future: [current(), ...history.future] });
            publish(entry);
          }}
          onRedo={() => {
            const entry = history.future[0];
            if (!entry) return;
            setHistory({ past: [...history.past, current()], future: history.future.slice(1) });
            publish(entry);
          }}
        />
      </div>
      <ActionButton size="sm" className="justify-self-start" icon={<BetweenHorizontalStart className="size-4" />}
        onClick={() => { const result = insertSeparator(value, ref.current?.selectionEnd ?? value.length); commit({ text: result.text, selection: result.selection }); }}>
        {separatorCopy[locale].insert}
      </ActionButton>
    </div>
  );
}
