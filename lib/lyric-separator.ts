/** Locale-independent plain-text projection of an atomic document separator. */
export const LYRIC_SEPARATOR = "<separator />";
export type LyricSeparatorStyle = "dot" | "line";
export type TextRange = { start: number; end: number };

export function isSeparatorLine(line: string) {
  return line.trim() === LYRIC_SEPARATOR;
}

export function isSeparatorUnit(unit: { source: string[]; translation?: string[] }) {
  const lines = [...unit.source, ...(unit.translation ?? [])];
  return lines.length > 0 && lines.every(isSeparatorLine);
}

export function separatorRanges(text: string): TextRange[] {
  return [...text.matchAll(/^([\t ]*)<separator \/>([\t ]*)\r?$/gm)].map((match) => ({
    start: match.index + match[1].length,
    end: match.index + match[1].length + LYRIC_SEPARATOR.length
  }));
}

/** Native selections can touch an atom, but never stop inside it. */
export function expandSeparatorSelection(text: string, selection: TextRange): TextRange {
  let { start, end } = selection;
  for (const token of separatorRanges(text)) {
    if (start < token.end && end > token.start) {
      start = Math.min(start, token.start);
      end = Math.max(end, token.end);
    }
  }
  return { start, end };
}

export function adjacentSeparator(text: string, position: number, backward: boolean) {
  return separatorRanges(text).find((token) => backward
    ? position >= token.end && /^[\t ]*\n?[\t ]*$/.test(text.slice(token.end, position))
    : position <= token.start && /^[\t ]*\n?[\t ]*$/.test(text.slice(position, token.start)));
}

export function insertSeparator(text: string, position: number) {
  const start = position === 0 ? 0 : text.lastIndexOf("\n", position - 1) + 1;
  const foundEnd = text.indexOf("\n", position);
  const end = foundEnd < 0 ? text.length : foundEnd;
  const line = text.slice(start, end);
  if (isSeparatorLine(line)) return { text, selection: { start, end } };
  // Keep an existing paragraph boundary so bilingual stanza pairing is unchanged.
  const replacement = line.trim() ? `${line}\n${LYRIC_SEPARATOR}\n`
    : `${LYRIC_SEPARATOR}\n${start > 0 && foundEnd >= 0 ? "\n" : ""}`;
  const next = text.slice(0, start) + replacement + text.slice(foundEnd < 0 ? end : end + 1);
  const cursor = start + replacement.length;
  return { text: next, selection: { start: cursor, end: cursor } };
}

/** Also handles cut, drop, mobile deletion, IME replacement and native undo input. */
export function protectSeparatorEdit(previous: string, next: string, cursor: number, selected?: TextRange) {
  if (previous === next) return { text: next, selection: { start: cursor, end: cursor } };
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  if (selected && selected.end > selected.start &&
    next.startsWith(previous.slice(0, selected.start)) && next.endsWith(previous.slice(selected.end)) &&
    next.length >= selected.start + previous.length - selected.end) {
    start = selected.start;
    oldEnd = selected.end;
    newEnd = next.length - (previous.length - selected.end);
  }
  const range = expandSeparatorSelection(previous, { start, end: oldEnd });
  const inserted = next.slice(start, newEnd);
  // A deletion of just the atom removes its row, rather than leaving a new blank line.
  if (!inserted && separatorRanges(previous).some((token) => token.start === range.start && token.end === range.end)) {
    if (previous[range.end] === "\n") range.end++;
    else if (previous[range.start - 1] === "\n") range.start--;
  }
  const surviving = separatorRanges(previous).filter((token) => token.end <= range.start || token.start >= range.end);
  let result = previous.slice(0, range.start) + inserted + previous.slice(range.end);
  let caret = range.start + inserted.length;
  // Preserve row boundaries when text is entered at an atom's edge or a newline is removed.
  for (const token of surviving.reverse()) {
    let tokenStart = token.start >= range.end
      ? token.start + inserted.length - (range.end - range.start)
      : token.start;
    const tokenEnd = tokenStart + LYRIC_SEPARATOR.length;
    if (tokenEnd < result.length && result[tokenEnd] !== "\n") {
      result = result.slice(0, tokenEnd) + "\n" + result.slice(tokenEnd);
      if (caret >= tokenEnd) caret++;
    }
    if (tokenStart > 0 && result[tokenStart - 1] !== "\n") {
      result = result.slice(0, tokenStart) + "\n" + result.slice(tokenStart);
      if (caret >= tokenStart) caret++;
      tokenStart++;
    }
  }
  if (result === next) caret = cursor;
  return { text: result, selection: { start: caret, end: caret } };
}
