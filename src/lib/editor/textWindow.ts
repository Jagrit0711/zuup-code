/**
 * Bounded view of a document around the cursor. Providers never look at more
 * than `maxChars` characters so the cost per keystroke stays constant for
 * very large files.
 */
export interface TextWindow {
  text: string;
  /** Cursor offset inside `text`. */
  offset: number;
  /** True when the document was cut. */
  truncated: boolean;
}

export const DEFAULT_WINDOW_CHARS = 200_000;

export function windowAround(text: string, offset: number, maxChars = DEFAULT_WINDOW_CHARS): TextWindow {
  const cursor = Math.max(0, Math.min(offset, text.length));
  if (text.length <= maxChars) return { text, offset: cursor, truncated: false };

  const half = Math.floor(maxChars / 2);
  let start = Math.max(0, cursor - half);
  let end = Math.min(text.length, start + maxChars);
  start = Math.max(0, end - maxChars);

  // Align to line boundaries so line-anchored scans never see a partial line.
  if (start > 0) {
    const nl = text.indexOf("\n", start);
    if (nl >= 0 && nl < cursor) start = nl + 1;
  }
  if (end < text.length) {
    const nl = text.lastIndexOf("\n", end);
    if (nl > cursor) end = nl;
  }
  return { text: text.slice(start, end), offset: cursor - start, truncated: true };
}
