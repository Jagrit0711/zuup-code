import type { SyntaxConfig } from "../syntax";

export type SymbolKind = "function" | "class" | "type" | "variable" | "constant" | "module" | "property";

/** A snippet in VS Code syntax. Use a literal tab for one indentation level. */
export interface SnippetDef {
  prefix: string;
  body: string;
  detail: string;
  doc?: string;
  /** A whole-file template (e.g. an HTML5 document); only offered as ghost text in an empty file. */
  wholeDocument?: boolean;
}

/** Matches a declaration on a single source line. */
export interface DeclRule {
  re: RegExp;
  kind: SymbolKind;
  /** Which names to record; defaults to capture group 1. */
  names?: (m: RegExpExecArray) => string[];
}

/** Read-only facts about the cursor position shared by inline rules. */
export interface RuleContext {
  languageId: string;
  /** Leading whitespace of the cursor line. */
  indent: string;
  indentUnit: string;
  /** Bounded window of the document (never the full text for huge files). */
  text: string;
}

/**
 * Completes the tail of the text before the cursor. `re` is matched against
 * the cursor line (without indentation) and must end with `$`.
 * `build` returns snippet source that replaces the whole match, or null.
 */
export interface InlineRule {
  re: RegExp;
  build: (m: RegExpExecArray, ctx: RuleContext) => string | null;
}

/**
 * Proposes the body of a block that was just opened: `opener` is tested
 * against the previous non-blank line when the cursor sits on a blank,
 * indented line.
 */
export interface BlockRule {
  opener: RegExp;
  build: (m: RegExpExecArray, ctx: RuleContext) => string | null;
}

export interface LangData {
  /** Canonical Monaco language id. */
  id: string;
  syntax: SyntaxConfig;
  /**
   * True when Monaco ships a language service for this language (TypeScript,
   * JavaScript, HTML, CSS, JSON). It already supplies keywords, globals and
   * symbols, so only snippets are added to avoid duplicate entries.
   */
  service?: boolean;
  /**
   * When true the suggest widget only lists this language's entries on an
   * explicit request (Ctrl+Space). Used where prose or data keys would make
   * automatic popups noisy (Markdown, YAML, JSON, XML).
   */
  explicitOnly?: boolean;
  /** Whitespace separated word lists. */
  keywords?: string;
  types?: string;
  /** Functions; insertion adds parentheses. */
  functions?: string;
  constants?: string;
  snippets: SnippetDef[];
  /**
   * Members offered after `receiver.` (or `receiver::`). Tokens ending in
   * `()` are methods, anything else is a property/constant.
   */
  members?: Record<string, string>;
  /** Offered after `.` on a receiver that is not in `members` (e.g. a variable). */
  genericMembers?: string;
  /** Static module names offered inside import/include/require strings. */
  modules?: string;
  decls?: DeclRule[];
  rules?: InlineRule[];
  blocks?: BlockRule[];
}

/** Split a whitespace separated word list. */
export function words(list: string | undefined): string[] {
  if (!list) return [];
  return list.split(/\s+/).filter(Boolean);
}

/** Shorthand used by the data tables. */
export function snip(prefix: string, detail: string, body: string, doc?: string): SnippetDef {
  return { prefix, body, detail, doc };
}

/** A whole-file template snippet (see `SnippetDef.wholeDocument`). */
export function fileSnip(prefix: string, detail: string, body: string, doc?: string): SnippetDef {
  return { prefix, body, detail, doc, wholeDocument: true };
}
