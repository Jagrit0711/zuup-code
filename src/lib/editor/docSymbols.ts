import type { DeclRule, SymbolKind } from "./languageData/types";

/** Hard limits that keep every scan O(n) with a small constant. */
export const MAX_DOC_LINES = 6000;
export const MAX_LINE_CHARS = 400;
export const MAX_SYMBOLS = 500;
export const MAX_WORDS = 400;
export const MAX_DOC_CHARS = 300_000;

export interface DocSymbol {
  name: string;
  kind: SymbolKind;
  /** 0-based line of the first declaration. */
  line: number;
}

/** Rank used when the same name is declared more than once. */
const KIND_RANK: Record<SymbolKind, number> = {
  class: 5,
  type: 5,
  function: 4,
  module: 3,
  constant: 2,
  property: 1,
  variable: 0,
};

/**
 * Names declared in the document according to `decls`. Declarations are
 * matched line by line (anchored regexes), so strings spanning lines or odd
 * formatting simply produce fewer symbols rather than wrong ones.
 */
export function extractDeclarations(lines: readonly string[], decls: readonly DeclRule[] | undefined): DocSymbol[] {
  if (!decls || decls.length === 0) return [];
  const found = new Map<string, DocSymbol>();
  const limit = Math.min(lines.length, MAX_DOC_LINES);

  for (let i = 0; i < limit && found.size < MAX_SYMBOLS; i++) {
    let line = lines[i];
    if (line.length === 0) continue;
    if (line.length > MAX_LINE_CHARS) line = line.slice(0, MAX_LINE_CHARS);
    for (const rule of decls) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const names = rule.names ? rule.names(m) : [m[1]];
      for (const name of names) {
        if (!name || name.length > 80) continue;
        const prev = found.get(name);
        if (!prev) {
          found.set(name, { name, kind: rule.kind, line: i });
        } else if (KIND_RANK[rule.kind] > KIND_RANK[prev.kind]) {
          found.set(name, { name, kind: rule.kind, line: prev.line });
        }
      }
    }
  }
  return [...found.values()];
}

/** Count identifier-like words (length 3-40) in the text, most frequent first. */
export function collectWords(text: string, skipStart = -1, skipEnd = -1): string[] {
  const re = /[A-Za-z_$][\w$]{2,39}/g;
  const counts = new Map<string, number>();
  let seen = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && seen < 40_000) {
    seen++;
    if (skipStart >= 0 && m.index >= skipStart && m.index <= skipEnd) continue;
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_WORDS)
    .map(([w]) => w);
}

/**
 * Names that appear after a dot in the document. With `receiver` only the
 * members used on that exact receiver are returned (e.g. `self.name`).
 */
export function collectMemberNames(text: string, receiver?: string, skipStart = -1, skipEnd = -1): string[] {
  const re = receiver
    ? new RegExp(`(?:^|[^\\w$.])${escapeRegExp(receiver)}\\.([A-Za-z_$][\\w$]*)`, "g")
    : /\.([A-Za-z_$][\w$]*)/g;
  const out = new Set<string>();
  let seen = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && seen < 20_000) {
    seen++;
    const nameStart = m.index + m[0].length - m[1].length;
    if (skipStart >= 0 && nameStart >= skipStart && nameStart <= skipEnd) continue;
    out.add(m[1]);
    if (out.size >= MAX_WORDS) break;
  }
  return [...out];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
