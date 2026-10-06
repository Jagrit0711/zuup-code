/**
 * Inline (ghost text) suggestion engine.
 *
 * Everything here is pure, offline and synchronous in cost: no Monaco types,
 * no network. A suggestion backend is a small `InlineProvider`; the built-in
 * providers cover snippet expansion, language rules (declarations, imports,
 * idioms), block bodies and repeating earlier lines. An AI or network backed
 * provider can be added later by passing an additional provider to
 * `createInlineEngine` - it receives the same `InlineContext`, may return a
 * Promise and must stop when `token.isCancellationRequested` becomes true.
 */

import { getLanguageData } from "./languageData";
import type { LangData } from "./languageData/types";
import { applyIndent, escapeSnippet, renderSnippet } from "./snippet";
import { scanContext, type CodeContext } from "./syntax";
import { windowAround } from "./textWindow";

// --- Limits (every provider must honour these) -----------------------------

/** Lines looked at when searching for an earlier line to repeat. */
export const MAX_REPEAT_LINES_BEFORE = 1500;
export const MAX_REPEAT_LINES_AFTER = 300;
/** Longest line considered or produced. */
export const MAX_SUGGEST_LINE_CHARS = 300;
/** Suggestions returned per request. */
export const MAX_SUGGESTIONS = 3;
/** Characters of the document the engine ever reads. */
export const MAX_ENGINE_CHARS = 120_000;

// --- Public types -----------------------------------------------------------

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
}

export interface InlineRequest {
  languageId: string;
  /** Document text (may be larger than the engine reads). */
  text: string;
  /** Cursor offset into `text`. */
  offset: number;
  /** One indentation level, e.g. two spaces, four spaces or a tab. */
  indentUnit: string;
  /** True for an explicit trigger (Alt+\\); relaxes minimum lengths. */
  explicit?: boolean;
}

export interface InlineContext {
  languageId: string;
  data: LangData | undefined;
  /** Bounded document window split into lines. */
  lines: readonly string[];
  /** Index of the cursor line inside `lines`. */
  lineIndex: number;
  /**
   * Cursor line before and after the cursor. When the rest of the line is only auto-closed
   * brackets/quotes (e.g. the `)` of `def foo(|)`), they are moved into `prefix` (see `consumed`)
   * so rules see the finished line, and `suffix` is left empty.
   */
  prefix: string;
  suffix: string;
  /** Characters of auto-closed text after the cursor that were appended to `prefix`. */
  consumed: number;
  /** Characters after the cursor (to the end of the line) every suggestion replaces. */
  replaceAfter: number;
  /** Leading whitespace of the cursor line. */
  indent: string;
  indentUnit: string;
  /** `prefix` without leading whitespace. */
  trimmedPrefix: string;
  /** The bounded document text. */
  text: string;
  context: CodeContext;
  explicit: boolean;
}

/** What a provider returns. `snippet` uses VS Code syntax with tabs as relative indent. */
export interface ProviderSuggestion {
  /** How many characters before the cursor (same line) the suggestion replaces. */
  replaceBefore: number;
  snippet: string;
  /** Higher wins. Built-ins use 50-90. */
  score: number;
  source: string;
}

export interface InlineProvider {
  readonly id: string;
  provide(
    ctx: InlineContext,
    token: CancellationLike,
  ): readonly ProviderSuggestion[] | null | undefined | Promise<readonly ProviderSuggestion[] | null | undefined>;
}

/** A finished suggestion, ready for an editor adapter. */
export interface InlineSuggestion {
  replaceBefore: number;
  /** How many characters after the cursor (same line) the suggestion replaces; 0 when absent. */
  replaceAfter?: number;
  /** Plain text with absolute indentation and placeholders resolved. */
  insertText: string;
  /** Snippet source (relative indentation) when it has tab stops, else undefined. */
  snippet?: string;
  /**
   * `snippet` with indentation already applied (renders to exactly `insertText`), for multi-line
   * suggestions with real tab stops: inserted through a snippet session after the ghost text is
   * accepted so placeholders can be tabbed through.
   */
  absoluteSnippet?: string;
  /** Offset inside `insertText` where the cursor should end up. */
  caret: number;
  multiline: boolean;
  score: number;
  source: string;
}

// --- Helpers ----------------------------------------------------------------

/** True when every character of `needle` appears in `haystack` in order. */
export function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack.charCodeAt(j) === needle.charCodeAt(i)) i++;
  }
  return i === needle.length;
}

const HAS_PLACEHOLDER = /(?:^|[^\\])\$(?:\d|\{\d)/;
/** A tab stop worth a snippet session: `$1`.. or a `${0:default}` placeholder. */
const HAS_TAB_STOP = /(?:^|[^\\])\$(?:[1-9]|\{[1-9]|\{0:)/;

/** Text after the cursor that an editor typically auto-closes (brackets, quotes, `;`). */
const AUTO_CLOSED_SUFFIX = /^([)\]}>"'`;]+)\s*$/;

/** Lines that should never be duplicated by a suggestion (imports, includes, packages). */
const IMPORT_LINE =
  /^(?:import\s|from\s+\S+\s+import\s|#\s*include\b|using\s|use\s|package\s|require\b|(?:const|let|var)\s+\w+\s*=\s*require\()/;

/** True when `text` has a line whose trimmed content is exactly `line`. */
export function hasLine(text: string, line: string): boolean {
  if (line === "") return false;
  for (let i = text.indexOf(line); i >= 0; i = text.indexOf(line, i + 1)) {
    const before = text.lastIndexOf("\n", i - 1) + 1;
    if (text.slice(before, i).trim() !== "") continue;
    let after = text.indexOf("\n", i + line.length);
    if (after < 0) after = text.length;
    if (text.slice(i + line.length, after).trim() === "") return true;
  }
  return false;
}

/** Build an `InlineContext` from a raw request. Returns null when the position is unsuitable. */
export function createInlineContext(req: InlineRequest): InlineContext | null {
  const win = windowAround(req.text, req.offset, MAX_ENGINE_CHARS);
  const text = win.text;
  const offset = win.offset;

  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  let lineEnd = text.indexOf("\n", offset);
  if (lineEnd < 0) lineEnd = text.length;
  let prefix = text.slice(lineStart, offset);
  let suffix = text.slice(offset, lineEnd);
  if (prefix.length > MAX_SUGGEST_LINE_CHARS || suffix.length > MAX_SUGGEST_LINE_CHARS) return null;

  const data = getLanguageData(req.languageId);
  const context = scanContext(text.slice(0, offset), data ? data.syntax : { lineComments: [], quotes: "" });

  // Auto-closed brackets/quotes after the cursor: let rules see the finished line and replace to its end.
  let consumed = 0;
  let replaceAfter = 0;
  const closers = AUTO_CLOSED_SUFFIX.exec(suffix);
  if (closers && prefix.trim() !== "") {
    consumed = closers[1].length;
    replaceAfter = suffix.length;
    prefix += closers[1];
    suffix = "";
  }

  // Only the lines providers may look at (never the whole window split per keystroke).
  let from = lineStart;
  let lineIndex = 0;
  while (from > 0 && lineIndex < MAX_REPEAT_LINES_BEFORE) {
    from = from >= 2 ? text.lastIndexOf("\n", from - 2) + 1 : 0;
    lineIndex++;
  }
  let to = lineEnd;
  for (let n = 0; n < MAX_REPEAT_LINES_AFTER && to < text.length; n++) {
    const nl = text.indexOf("\n", to + 1);
    to = nl < 0 ? text.length : nl;
  }
  const lines = text.slice(from, to).split("\n");

  const indent = /^[ \t]*/.exec(prefix)?.[0] ?? "";
  return {
    languageId: data?.id ?? req.languageId,
    data,
    lines,
    lineIndex,
    prefix,
    suffix,
    consumed,
    replaceAfter,
    indent,
    indentUnit: req.indentUnit || "  ",
    trimmedPrefix: prefix.slice(indent.length),
    text,
    context,
    explicit: !!req.explicit,
  };
}

// --- Built-in providers -------------------------------------------------------

const COMMENT_ONLY = /^[\s/*#;%-]*$/;

/** Language specific completion rules (declaration bodies, imports, idioms). The first matching rule wins. */
export const rulesProvider: InlineProvider = {
  id: "rules",
  provide(ctx) {
    const rules = ctx.data?.rules;
    if (!rules || ctx.trimmedPrefix.length === 0) return null;
    const ruleCtx = { languageId: ctx.languageId, indent: ctx.indent, indentUnit: ctx.indentUnit, text: ctx.text };
    for (const rule of rules) {
      const m = rule.re.exec(ctx.trimmedPrefix);
      if (!m) continue;
      const snippet = rule.build(m, ruleCtx);
      // A more specific rule matched: later, more generic rules must not add noise.
      return snippet ? [{ replaceBefore: m[0].length, snippet, score: 90, source: "rule" }] : null;
    }
    return null;
  },
};

interface PreparedSnippet {
  prefix: string;
  body: string;
  /** Rendered text (placeholders replaced by defaults). */
  plain: string;
  /** Literal text before the first placeholder, first line only. */
  head: string;
  wholeDocument: boolean;
}

const preparedSnippets = new WeakMap<LangData, PreparedSnippet[]>();

/** Snippets rendered once per language instead of on every keystroke. */
function snippetsOf(data: LangData): PreparedSnippet[] {
  let list = preparedSnippets.get(data);
  if (!list) {
    list = data.snippets.map((s) => {
      const firstStop = s.body.search(/(?<!\\)\$/);
      const head = renderSnippet(firstStop < 0 ? s.body : s.body.slice(0, firstStop)).text.split("\n", 1)[0];
      return { prefix: s.prefix, body: s.body, plain: renderSnippet(s.body).text, head, wholeDocument: !!s.wholeDocument };
    });
    preparedSnippets.set(data, list);
  }
  return list;
}

/**
 * Expands a typed snippet prefix at the start of a line. Only exact prefixes (any length from 2),
 * longer prefixes whose expansion starts with the typed text (3+ characters), or member paths such as
 * `console.l` / `System.out.p` that the literal start of a snippet continues.
 */
export const snippetProvider: InlineProvider = {
  id: "snippets",
  provide(ctx) {
    const data = ctx.data;
    const token = ctx.trimmedPrefix;
    if (!data || token.length < (ctx.explicit ? 1 : 2) || !/^[A-Za-z_][\w.:]*$/.test(token)) return null;
    const member = /[.:]/.test(token);
    let emptyDocument: boolean | undefined;

    const out: ProviderSuggestion[] = [];
    for (const s of snippetsOf(data)) {
      let score = 0;
      if (s.wholeDocument) {
        // File templates: only in an otherwise empty file, where any start of the prefix is a clear intent.
        if (!s.prefix.startsWith(token)) continue;
        emptyDocument ??= ctx.text.trim() === ctx.trimmedPrefix.trim();
        if (!emptyDocument) continue;
        score = s.prefix === token ? 76 : 74;
      } else if (s.prefix === token) score = 76;
      else if (token.length >= 3 && s.prefix.startsWith(token) && s.plain.startsWith(token)) score = 72;
      else if (member && token.length >= 3 && s.head.length > token.length && s.head.startsWith(token)) score = 68;
      if (!score || s.plain === token) continue;
      out.push({ replaceBefore: token.length, snippet: s.body, score: score - Math.min(6, Math.floor(s.prefix.length / 4)), source: "snippet" });
    }
    return out;
  },
};

/** Proposes the body of a block that has just been opened (blank, indented cursor line). */
export const blockProvider: InlineProvider = {
  id: "blocks",
  provide(ctx) {
    const blocks = ctx.data?.blocks;
    if (!blocks || ctx.trimmedPrefix !== "" || ctx.suffix !== "") return null;

    // Previous non-blank line (at most three lines up).
    let prevIndex = ctx.lineIndex - 1;
    while (prevIndex >= 0 && prevIndex >= ctx.lineIndex - 3 && ctx.lines[prevIndex].trim() === "") prevIndex--;
    if (prevIndex < 0 || prevIndex < ctx.lineIndex - 3) return null;
    const prevLine = ctx.lines[prevIndex];
    if (prevLine.length > MAX_SUGGEST_LINE_CHARS) return null;
    const prevIndent = /^[ \t]*/.exec(prevLine)?.[0] ?? "";
    if (ctx.indent.length <= prevIndent.length) return null;

    // Body already present below? Then there is nothing to propose.
    for (let i = ctx.lineIndex + 1; i < Math.min(ctx.lines.length, ctx.lineIndex + 6); i++) {
      const line = ctx.lines[i];
      if (line.trim() === "") continue;
      const indentBelow = /^[ \t]*/.exec(line)?.[0] ?? "";
      if (indentBelow.length >= ctx.indent.length) return null;
      break;
    }

    const ruleCtx = { languageId: ctx.languageId, indent: ctx.indent, indentUnit: ctx.indentUnit, text: ctx.text };
    for (const block of blocks) {
      const m = block.opener.exec(prevLine);
      if (!m) continue;
      const snippet = block.build(m, ruleCtx);
      if (snippet) return [{ replaceBefore: 0, snippet: escapeSnippet(snippet), score: 80, source: "block" }];
    }
    return null;
  },
};

/** Finishes the current line like an earlier line of the document that starts the same way. */
export const repeatLineProvider: InlineProvider = {
  id: "repeat",
  provide(ctx, token) {
    const prefix = ctx.trimmedPrefix;
    if (prefix.length < (ctx.explicit ? 2 : 3) || COMMENT_ONLY.test(prefix)) return null;
    const commentTokens = ctx.data?.syntax.lineComments ?? [];
    const out: ProviderSuggestion[] = [];
    const seen = new Set<string>();

    const consider = (line: string, distance: number): boolean => {
      if (line.length === 0 || line.length > MAX_SUGGEST_LINE_CHARS + 80) return false;
      const t = line.trim();
      if (t.length <= prefix.length || !t.startsWith(prefix)) return false;
      if (commentTokens.some((c) => t.startsWith(c))) return false;
      const rest = t.slice(prefix.length);
      if (seen.has(rest)) return false;
      seen.add(rest);
      // Short prefixes rank below snippets; a long, specific prefix is a strong signal.
      const score = 60 + Math.min(prefix.length, 16) * 1.5 - Math.min(distance, 20) * 0.5;
      out.push({ replaceBefore: prefix.length, snippet: escapeSnippet(t), score, source: "repeat" });
      return out.length >= MAX_SUGGESTIONS;
    };

    const first = Math.max(0, ctx.lineIndex - MAX_REPEAT_LINES_BEFORE);
    for (let i = ctx.lineIndex - 1, n = 0; i >= first; i--, n++) {
      if ((n & 255) === 255 && token.isCancellationRequested) return out;
      if (consider(ctx.lines[i], n)) return out;
    }
    const last = Math.min(ctx.lines.length, ctx.lineIndex + 1 + MAX_REPEAT_LINES_AFTER);
    for (let i = ctx.lineIndex + 1, n = 0; i < last; i++, n++) {
      if ((n & 255) === 255 && token.isCancellationRequested) return out;
      if (consider(ctx.lines[i], n + 25)) return out;
    }
    return out;
  },
};

export const defaultInlineProviders: readonly InlineProvider[] = [rulesProvider, blockProvider, snippetProvider, repeatLineProvider];

// --- Engine -------------------------------------------------------------------

export interface InlineEngine {
  suggest(req: InlineRequest, token?: CancellationLike): Promise<InlineSuggestion[]>;
}

const NEVER_CANCELLED: CancellationLike = { isCancellationRequested: false };

export function finishSuggestion(p: ProviderSuggestion, ctx: InlineContext): InlineSuggestion | null {
  // Auto-closed text after the cursor was moved into the prefix; the edit must replace it too.
  const replaceBefore = p.replaceBefore - ctx.consumed;
  if (replaceBefore < 0) return null;
  const rendered = renderSnippet(p.snippet);
  const typed = ctx.prefix.slice(ctx.prefix.length - p.replaceBefore);
  const caretText = applyIndent(rendered.text.slice(0, rendered.caret), ctx.indent, ctx.indentUnit);
  const insertText = applyIndent(rendered.text, ctx.indent, ctx.indentUnit);
  if (insertText === typed || insertText.trim() === "") return null;
  // The typed text must survive in the suggestion (Monaco shows only the rest as ghost text).
  if (!isSubsequence(typed.replace(/\s+$/, ""), insertText)) return null;
  const firstLine = insertText.split("\n", 1)[0];
  if (firstLine.length > MAX_SUGGEST_LINE_CHARS * 2) return null;

  const multiline = insertText.includes("\n");
  // Multi-line edits must end at the very end of a line (Monaco requirement).
  if (multiline && ctx.suffix !== "") return null;
  // Never propose a second copy of an import / include that is already there.
  if (!multiline && IMPORT_LINE.test(insertText) && hasLine(ctx.text, insertText.trim())) return null;

  let absoluteSnippet: string | undefined;
  if (multiline && HAS_TAB_STOP.test(p.snippet)) {
    const abs = applyIndent(p.snippet, ctx.indent, ctx.indentUnit);
    // Only when the session would insert exactly what was previewed.
    if (renderSnippet(abs).text === insertText) absoluteSnippet = abs;
  }
  return {
    replaceBefore,
    replaceAfter: ctx.replaceAfter,
    insertText,
    snippet: HAS_PLACEHOLDER.test(p.snippet) ? p.snippet : undefined,
    absoluteSnippet,
    caret: caretText.length,
    multiline,
    score: p.score,
    source: p.source,
  };
}

export function createInlineEngine(providers: readonly InlineProvider[] = defaultInlineProviders): InlineEngine {
  return {
    async suggest(req, token = NEVER_CANCELLED) {
      const ctx = createInlineContext(req);
      if (!ctx || ctx.context !== "code") return [];
      // Ghost text needs a tidy end of line.
      if (ctx.suffix.trim() !== "") return [];

      const collected: InlineSuggestion[] = [];
      for (const provider of providers) {
        if (token.isCancellationRequested) return [];
        let result: readonly ProviderSuggestion[] | null | undefined;
        try {
          result = await provider.provide(ctx, token);
        } catch {
          continue; // one failing provider must never break the others
        }
        if (token.isCancellationRequested) return [];
        for (const p of result ?? []) {
          const done = finishSuggestion(p, ctx);
          if (done) collected.push(done);
        }
      }

      collected.sort((a, b) => b.score - a.score);
      const unique: InlineSuggestion[] = [];
      const seen = new Set<string>();
      for (const s of collected) {
        const key = `${s.replaceBefore}\u0000${s.insertText}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(s);
        if (unique.length >= MAX_SUGGESTIONS) break;
      }
      return unique;
    },
  };
}

/** Shared engine with the built-in providers. */
export const defaultInlineEngine = createInlineEngine();
