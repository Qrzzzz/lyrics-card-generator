"use client";

import { useId, useLayoutEffect, useRef, useState, type RefObject, type TextareaHTMLAttributes } from "react";
import {
  adjacentSeparator, expandSeparatorSelection, LYRIC_SEPARATOR,
  protectSeparatorEdit, separatorRanges, type TextRange
} from "@/lib/lyric-separator";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
  ref: RefObject<HTMLTextAreaElement | null>;
  separatorHint: string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/** Keep native text input, IME and viewport geometry; expose markers as indivisible atoms. */
export function AtomicLyricsTextarea({
  value, ref, separatorHint, onUndo, onRedo, canUndo, canRedo, ...props
}: Props) {
  const hintId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<TextRange>({ start: 0, end: 0 });
  const inputSelectionRef = useRef<TextRange | null>(null);
  const [selection, setSelection] = useState<TextRange>({ start: 0, end: 0 });
  const tokens = separatorRanges(value);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const beforeInput = (event: InputEvent) => {
      inputSelectionRef.current = { start: node.selectionStart, end: node.selectionEnd };
      if (!event.cancelable || event.isComposing || node.selectionStart !== node.selectionEnd) return;
      if (event.inputType !== "deleteContentBackward" && event.inputType !== "deleteContentForward") return;
      const token = adjacentSeparator(value, node.selectionStart, event.inputType === "deleteContentBackward");
      if (!token) return;
      event.preventDefault();
      selectionRef.current = token;
      node.setSelectionRange(token.start, token.end);
      setSelection(token);
    };
    node.addEventListener("beforeinput", beforeInput);
    return () => node.removeEventListener("beforeinput", beforeInput);
  }, [value, ref]);

  useLayoutEffect(() => {
    const node = ref.current;
    const overlay = overlayRef.current;
    if (!node || !overlay) return;
    const sync = () => {
      const border = parseFloat(getComputedStyle(node).borderLeftWidth) || 0;
      overlay.style.width = `${node.clientWidth + border * 2}px`;
      overlay.style.height = `${node.offsetHeight}px`;
      overlay.scrollTop = node.scrollTop;
      overlay.scrollLeft = node.scrollLeft;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, ref]);

  function select(node: HTMLTextAreaElement, range: TextRange) {
    selectionRef.current = range;
    node.setSelectionRange(range.start, range.end);
    setSelection(range);
  }

  return (
    <>
      <textarea
        {...props}
        ref={ref}
        value={value}
        aria-describedby={[props["aria-describedby"], tokens.length ? hintId : ""].filter(Boolean).join(" ") || undefined}
        onPaste={(event) => {
          inputSelectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
          props.onPaste?.(event);
        }}
        onCut={(event) => {
          inputSelectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
          props.onCut?.(event);
        }}
        onScroll={(event) => {
          if (overlayRef.current) {
            overlayRef.current.scrollTop = event.currentTarget.scrollTop;
            overlayRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }
          props.onScroll?.(event);
        }}
        onSelect={(event) => {
          const node = event.currentTarget;
          const native = { start: node.selectionStart, end: node.selectionEnd };
          const atomic = expandSeparatorSelection(value, native);
          selectionRef.current = atomic;
          if (atomic.start !== native.start || atomic.end !== native.end) select(node, atomic);
          else setSelection((current) => current.start === native.start && current.end === native.end ? current : native);
          props.onSelect?.(event);
        }}
        onKeyDown={(event) => {
          const node = event.currentTarget;
          if (event.nativeEvent.isComposing) return;
          if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "z" || key === "y") {
              const redo = key === "y" || event.shiftKey;
              if (redo ? canRedo : canUndo) {
                event.preventDefault();
                (redo ? onRedo : onUndo)();
                return;
              }
            }
          }
          const start = node.selectionStart;
          const end = node.selectionEnd;
          if (event.key === "Backspace" || event.key === "Delete") {
            if (start === end) {
              const token = adjacentSeparator(value, start, event.key === "Backspace");
              if (token) {
                event.preventDefault();
                select(node, token);
                return;
              }
            } else if (event.repeat && tokens.some((token) => token.start === start && token.end === end)) {
              event.preventDefault();
              return;
            }
          }
          if (!event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            const left = event.key === "ArrowLeft";
            const token = tokens.find((item) => start === end
              ? (left ? item.end === start : item.start === start)
              : item.start === start && item.end === end);
            if (token) {
              event.preventDefault();
              const position = left ? token.start : token.end;
              select(node, { start: position, end: position });
              return;
            }
          }
          if (event.key === "Escape" && start !== end) {
            select(node, { start: end, end });
          }
          props.onKeyDown?.(event);
        }}
        onChange={(event) => {
          const node = event.currentTarget;
          const result = protectSeparatorEdit(value, node.value, node.selectionStart, inputSelectionRef.current ?? selectionRef.current);
          inputSelectionRef.current = null;
          selectionRef.current = result.selection;
          if (result.text !== node.value) {
            node.value = result.text;
            select(node, result.selection);
          }
          props.onChange?.(event);
        }}
      />
      {tokens.length > 0 ? (
        <>
          <span id={hintId} className="sr-only">{separatorHint}</span>
          <div
            ref={overlayRef}
            aria-hidden="true"
            className={`${props.className ?? ""} lyrics-atomic-overlay`}
          >
            {tokens.map((token, index) => (
              <span key={token.start}>
                {value.slice(index === 0 ? 0 : tokens[index - 1].end, token.start)}
                <span
                  className="lyrics-separator-token"
                  data-testid="lyrics-separator-token"
                  data-selected={selection.start <= token.start && selection.end >= token.end}
                  title={separatorHint}
                  onMouseDown={(event) => {
                    // The atom stays in the textarea's single selection/undo model.
                    if (event.button !== 0 || !ref.current) return;
                    event.preventDefault();
                    ref.current.focus({ preventScroll: true });
                    select(ref.current, token);
                  }}
                >
                  {LYRIC_SEPARATOR}
                </span>
              </span>
            ))}
            {value.slice(tokens[tokens.length - 1].end)}
          </div>
        </>
      ) : null}
    </>
  );
}
