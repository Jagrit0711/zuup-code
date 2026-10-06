import { collectMemberNames, collectWords, extractDeclarations, MAX_LINE_CHARS } from "./docSymbols";
import { getLanguageData } from "./languageData";
import type { LangData, SymbolKind } from "./languageData/types";
import { words } from "./languageData/types";
import { renderSnippet } from "./snippet";
import { scanContext } from "./syntax";
import { windowAround } from "./textWindow";

export type CandidateKind =
  | "keyword"
  | "function"
  | "method"
  | "class"
  | "type"
  | "variable"
  | "constant"
  | "property"
  | "snippet"
  | "module"
  | "text";

export interface Candidate {
  label: string;
  kind: CandidateKind;
  insertText: string;
  isSnippet: boolean;
  detail?: string;
  documentation?: string;
  filterText?: string;
  /** Lower sorts first. Monaco applies it after the fuzzy score. */
  sortText: string;
}

export interface CompletionResult {
  candidates: Candidate[];
  /** Characters before the cursor that the chosen item replaces. */
  replaceBefore: number;
  /** Characters after the cursor that the chosen item replaces. */
  replaceAfter: number;
}

export interface CompletionOptions {
  /** Trigger character when the request came from typing one. */
  triggerCharacter?: string;
  /** True for explicit invocation (Ctrl+Space) which lists everything. */
  explicit?: boolean;
}

const EMPTY: CompletionResult = { candidates: [], replaceBefore: 0, replaceAfter: 0 };

const SYMBOL_TO_CANDIDATE: Record<SymbolKind, CandidateKind> = {
  function: "function",
  class: "class",
  type: "type",
  variable: "variable",
  constant: "constant",
  module: "module",
  property: "property",
};

/**
 * Per-language patterns for "what the user is typing is a module path".
 * Group 1 is the path typed so far; `close` is appended when it is missing.
 */
interface ModuleContext {
  re: RegExp;
  close?: (typedOpener: string) => string;
  /** Extra guard evaluated with the text before the cursor line. */
  when?: (textBeforeLine: string) => boolean;
}

const JS_MODULE: ModuleContext = { re: /(?:\bfrom\s+|\bimport\s+|\brequire\(\s*)["']((?:node:)?[\w./@-]*)$/ };

const MODULE_CONTEXTS: Record<string, ModuleContext[]> = {
  c: [{ re: /^\s*#\s*include\s*([<"])([\w./+]*)$/, close: (o) => (o === "<" ? ">" : '"') }],
  cpp: [{ re: /^\s*#\s*include\s*([<"])([\w./+]*)$/, close: (o) => (o === "<" ? ">" : '"') }],
  python: [{ re: /^\s*(?:import|from)\s+(?:[\w.]+\s*,\s*)*([\w.]*)$/ }],
  java: [{ re: /^\s*import\s+(?:static\s+)?([\w.]*)$/ }],
  kotlin: [{ re: /^\s*import\s+([\w.]*)$/ }],
  scala: [{ re: /^\s*import\s+([\w.]*)$/ }],
  csharp: [{ re: /^\s*using\s+(?:static\s+)?([\w.]*)$/ }],
  swift: [{ re: /^\s*import\s+(\w*)$/ }],
  haskell: [{ re: /^\s*import\s+(?:qualified\s+)?([\w.]*)$/ }],
  go: [
    { re: /^\s*import\s+(?:\w+\s+)?"([\w./-]*)$/ },
    { re: /^\s*(?:\w+\s+)?"([\w./-]*)$/, when: (before) => /(?:^|\n)import\s*\([^)]*$/.test(before) },
  ],
  dart: [{ re: /^\s*import\s+'([\w:./]*)$/ }],
  javascript: [JS_MODULE],
  typescript: [JS_MODULE],
};

/** Languages whose path text contains characters beyond identifier characters. */
function matchModuleContext(languageId: string, linePrefix: string, textBeforeLine: string) {
  const list = MODULE_CONTEXTS[languageId];
  if (!list) return null;
  for (const ctx of list) {
    const m = ctx.re.exec(linePrefix);
    if (!m) continue;
    if (ctx.when && !ctx.when(textBeforeLine)) continue;
    const typed = m[m.length - 1];
    const opener = m.length > 2 ? m[1] : "";
    return { typed, close: ctx.close && opener ? ctx.close(opener) : undefined };
  }
  return null;
}

function lineIndexOf(text: string, offset: number): number {
  let n = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

function lineBounds(text: string, offset: number) {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  let end = text.indexOf("\n", offset);
  if (end < 0) end = text.length;
  return { start, end };
}

/** Receiver chain before a trailing `.`, `::` or `->`, if there is one. */
export function receiverBefore(textBeforeWord: string): { chain: string | null; number: boolean } | null {
  const trailing = /(\.|::|->)$/.exec(textBeforeWord);
  if (!trailing) return null;
  const head = textBeforeWord.slice(0, textBeforeWord.length - trailing[0].length);
  const m = /([A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*)$/.exec(head);
  if (m) return { chain: m[1], number: false };
  return { chain: null, number: /\d$/.test(head) };
}

function parseMemberToken(token: string): { name: string; callable: boolean } {
  return token.endsWith("()") ? { name: token.slice(0, -2), callable: true } : { name: token, callable: false };
}

function memberCandidate(token: string, sort: string, followedByParen: boolean): Candidate {
  const { name, callable } = parseMemberToken(token);
  const asCall = callable && !followedByParen;
  const kind: CandidateKind = callable
    ? "method"
    : /^[A-Z][A-Z0-9_]*$/.test(name)
      ? "constant"
      : /^[A-Z]/.test(name)
        ? "class"
        : "property";
  return {
    label: name,
    kind,
    insertText: asCall ? `${name}($0)` : name,
    isSnippet: asCall,
    sortText: sort + name.toLowerCase(),
  };
}

function lookupMembers(data: LangData, chain: string): string[] | undefined {
  const members = data.members;
  if (!members) return undefined;
  const direct = members[chain];
  if (direct) return words(direct);
  const last = chain.split(/\.|::/).pop() as string;
  const byLast = members[last];
  return byLast ? words(byLast) : undefined;
}

/** Build the candidate list for the cursor position. Pure and synchronous. */
export function buildCompletions(
  languageId: string,
  fullText: string,
  fullOffset: number,
  options: CompletionOptions = {},
): CompletionResult {
  const data = getLanguageData(languageId);
  if (!data) return EMPTY;

  const { text, offset } = windowAround(fullText, fullOffset);
  const { start: lineStart, end: lineEnd } = lineBounds(text, offset);
  const linePrefix = text.slice(Math.max(lineStart, offset - MAX_LINE_CHARS), offset);
  const lineSuffix = text.slice(offset, Math.min(lineEnd, offset + MAX_LINE_CHARS));

  // Include / import paths are completed even though they sit inside strings.
  const textBeforeLine = text.slice(0, lineStart);
  const moduleCtx = data.modules ? matchModuleContext(data.id, linePrefix, textBeforeLine) : null;
  if (moduleCtx && scanContext(textBeforeLine, data.syntax) === "code") {
    return moduleCandidates(data, moduleCtx.typed, moduleCtx.close, lineSuffix);
  }

  const context = scanContext(text.slice(0, offset), data.syntax);
  if (context !== "code") return EMPTY;

  const wordBefore = /[\w$]*$/.exec(linePrefix)?.[0] ?? "";
  const wordAfter = /^[\w$]*/.exec(lineSuffix)?.[0] ?? "";
  // Typing a number: nothing to complete.
  if (wordBefore && /^\d/.test(wordBefore)) return EMPTY;

  const textBeforeWord = linePrefix.slice(0, linePrefix.length - wordBefore.length);
  const receiver = receiverBefore(textBeforeWord);
  const followedByParen = lineSuffix.charAt(wordAfter.length) === "(";
  const wordStart = offset - wordBefore.length;
  const wordEnd = offset + wordAfter.length;

  if (receiver) {
    if (receiver.number) return EMPTY;
    return memberResult(data, receiver.chain, text, wordStart, wordEnd, wordBefore.length, wordAfter.length, followedByParen);
  }

  if (data.explicitOnly && !options.explicit) return EMPTY;

  // A trigger character that opened nothing special should not pop a giant list.
  if (!wordBefore && options.triggerCharacter && !options.explicit) return EMPTY;
  if (!wordBefore && !options.explicit && !options.triggerCharacter) return EMPTY;

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const add = (c: Candidate) => {
    if (seen.has(c.label)) return;
    seen.add(c.label);
    candidates.push(c);
  };

  const snippetPrefixes = new Set(data.snippets.map((s) => s.prefix));

  // 1. Symbols declared in this document (all languages with decl rules).
  if (!data.service) {
    const lines = text.split("\n");
    const cursorLine = lineIndexOf(text, offset);
    for (const sym of extractDeclarations(lines, data.decls)) {
      // The name still being typed on its own declaration line is not declared yet.
      if (sym.line === cursorLine && sym.name === wordBefore + wordAfter) continue;
      add({
        label: sym.name,
        kind: SYMBOL_TO_CANDIDATE[sym.kind],
        insertText: sym.kind === "function" && !followedByParen ? `${sym.name}($0)` : sym.name,
        isSnippet: sym.kind === "function" && !followedByParen,
        detail: `${sym.kind} declared on line ${sym.line + 1}`,
        sortText: `1${sym.name.toLowerCase()}`,
      });
    }

    const matchCase = (kw: string) =>
      data.id === "sql" && wordBefore && wordBefore === wordBefore.toLowerCase() ? kw.toLowerCase() : kw;

    for (const fn of words(data.functions)) {
      const name = fn.replace(/\(\)$/, "");
      add({
        label: name,
        kind: "function",
        insertText: followedByParen ? name : `${name}($0)`,
        isSnippet: !followedByParen,
        sortText: `2${name.toLowerCase()}`,
      });
    }
    for (const t of words(data.types)) {
      add({ label: t, kind: /^[A-Z]/.test(t) ? "class" : "type", insertText: t, isSnippet: false, sortText: `2${t.toLowerCase()}` });
    }
    for (const k of words(data.constants)) {
      add({ label: k, kind: "constant", insertText: k, isSnippet: false, sortText: `2${k.toLowerCase()}` });
    }
    for (const kw of words(data.keywords)) {
      if (snippetPrefixes.has(kw)) continue; // the snippet already carries this keyword
      add({ label: matchCase(kw), kind: "keyword", insertText: matchCase(kw), isSnippet: false, sortText: `4${kw.toLowerCase()}` });
    }
  }

  const snippetsAllowed =
    data.id === "css" ? !/:[^;{}]*$/.test(textBeforeWord) : data.id === "html" ? !/<[^>]*$/.test(textBeforeWord) : true;

  for (const s of snippetsAllowed ? data.snippets : []) {
    const preview = renderSnippet(s.body).text.replace(/\t/g, "  ");
    add({
      label: s.prefix,
      kind: "snippet",
      insertText: s.body,
      isSnippet: true,
      detail: s.detail,
      documentation: preview,
      sortText: `3${s.prefix.toLowerCase()}`,
    });
  }

  if (!data.service) {
    // 2. Other identifiers in the document, as a fallback for names we cannot declare-match.
    for (const w of collectWords(text, wordStart, wordEnd)) {
      add({ label: w, kind: "text", insertText: w, isSnippet: false, sortText: `5${w.toLowerCase()}` });
    }
  }

  return { candidates, replaceBefore: wordBefore.length, replaceAfter: wordAfter.length };
}

function memberResult(
  data: LangData,
  chain: string | null,
  text: string,
  wordStart: number,
  wordEnd: number,
  before: number,
  after: number,
  followedByParen: boolean,
): CompletionResult {
  // The language service already knows the members of its own objects.
  if (data.service) return { candidates: [], replaceBefore: before, replaceAfter: after };

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    if (seen.has(c.label)) return;
    seen.add(c.label);
    candidates.push(c);
  };

  const known = chain ? lookupMembers(data, chain) : undefined;
  if (known) known.forEach((t) => push(memberCandidate(t, "1", followedByParen)));
  else if (data.genericMembers) words(data.genericMembers).forEach((t) => push(memberCandidate(t, "3", followedByParen)));

  // Members actually used in this document (e.g. `self.name`) beat guesses.
  const used = collectMemberNames(text, !known && chain ? chain : undefined, wordStart, wordEnd);
  for (const name of used) push({ label: name, kind: "property", insertText: name, isSnippet: false, sortText: `2${name.toLowerCase()}` });

  return { candidates, replaceBefore: before, replaceAfter: after };
}

function moduleCandidates(data: LangData, typed: string, close: string | undefined, lineSuffix: string): CompletionResult {
  const hasCloser = close ? lineSuffix.startsWith(close) : true;
  const candidates: Candidate[] = words(data.modules).map((name) => ({
    label: name,
    kind: "module" as const,
    insertText: close && !hasCloser ? name + close : name,
    isSnippet: false,
    filterText: name,
    sortText: `1${name.toLowerCase()}`,
  }));
  return { candidates, replaceBefore: typed.length, replaceAfter: 0 };
}
