/**
 * Minimal, language-agnostic lexical scanner. It answers one question cheaply:
 * "is this position inside a comment or a string?" so completion and inline
 * suggestion providers can stay quiet where they would only be noise.
 */

export interface SyntaxConfig {
  /** Tokens that start a comment running to the end of the line. */
  lineComments: string[];
  /** Pairs of block comment delimiters. */
  blockComments?: [string, string][];
  /** Characters that open a string confined to one line. */
  quotes: string;
  /** Delimiters of strings allowed to span lines (e.g. `"""` or a backtick). */
  multilineQuotes?: string[];
  /**
   * When true a single quote is only a string if it forms a character literal
   * ('a' or '\n'); otherwise it is code (e.g. a Rust lifetime).
   */
  charLiterals?: boolean;
}

export type CodeContext = "code" | "comment" | "string";

export const DEFAULT_SYNTAX: SyntaxConfig = { lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: "\"'" };

/** Upper bound of characters scanned; longer text is scanned from its tail. */
export const MAX_SCAN_CHARS = 200_000;

/**
 * Classify the position at the end of `text` (everything before the cursor).
 * O(n) with a single pass and no allocations beyond the result.
 */
export function scanContext(text: string, cfg: SyntaxConfig): CodeContext {
  const start = text.length > MAX_SCAN_CHARS ? text.length - MAX_SCAN_CHARS : 0;
  const n = text.length;
  const multi = cfg.multilineQuotes ?? [];
  const blocks = cfg.blockComments ?? [];
  let i = start;

  while (i < n) {
    const ch = text[i];

    // Multi-line strings first so that `"""` wins over `"`.
    let handled = false;
    for (const q of multi) {
      if (text.startsWith(q, i)) {
        const end = findStringEnd(text, i + q.length, q);
        if (end < 0) return "string";
        i = end + q.length;
        handled = true;
        break;
      }
    }
    if (handled) continue;

    for (const lc of cfg.lineComments) {
      if (text.startsWith(lc, i)) {
        const nl = text.indexOf("\n", i);
        if (nl < 0) return "comment";
        i = nl + 1;
        handled = true;
        break;
      }
    }
    if (handled) continue;

    for (const [open, close] of blocks) {
      if (text.startsWith(open, i)) {
        const end = text.indexOf(close, i + open.length);
        if (end < 0) return "comment";
        i = end + close.length;
        handled = true;
        break;
      }
    }
    if (handled) continue;

    if (cfg.quotes.includes(ch)) {
      if (ch === "'" && cfg.charLiterals) {
        // 'x' or '\x' (and longer escapes such as '\u{1F600}') are char literals.
        const m = /^'(?:\\[^\n']{1,10}|[^\\\n'])'/.exec(text.slice(i, i + 14));
        if (m) {
          i += m[0].length;
        } else {
          i += 1; // lifetime or stray quote: treat as code
        }
        continue;
      }
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === "\n") break;
        if (c === ch) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        i = j + 1;
      } else if (j >= n) {
        return "string";
      } else {
        i = j + 1; // unterminated string ends at the newline
      }
      continue;
    }

    i++;
  }
  return "code";
}

function findStringEnd(text: string, from: number, quote: string): number {
  let j = from;
  const n = text.length;
  while (j < n) {
    if (text[j] === "\\") {
      j += 2;
      continue;
    }
    if (text.startsWith(quote, j)) return j;
    j++;
  }
  return -1;
}
