/**
 * Thin Monaco adapters around the pure completion and inline engines.
 * Only types are imported from Monaco so this module is cheap to load in tests.
 */
import type { Monaco } from "@monaco-editor/react";
import type { IDisposable, editor, languages, Position } from "monaco-editor";
import { buildCompletions, type CandidateKind } from "./completions";
import { defaultInlineEngine, MAX_ENGINE_CHARS, type InlineEngine, type InlineSuggestion } from "./inlineSuggest";
import { escapeSnippet } from "./snippet";
import { SUPPORTED_LANGUAGE_IDS } from "./languageData";
import { DEFAULT_WINDOW_CHARS } from "./textWindow";

/** Languages whose models Monaco may create (aliases never appear as model ids). */
const COMPLETION_LANGUAGES = [...SUPPORTED_LANGUAGE_IDS];

const TRIGGER_CHARACTERS = [".", ":", "<", "/", '"', "'", "#", ">"];

/** Text around the cursor without copying whole huge documents. */
function documentWindow(
  model: editor.ITextModel,
  position: Position,
  radius = DEFAULT_WINDOW_CHARS,
): { text: string; offset: number } {
  const length = model.getValueLength();
  const offset = model.getOffsetAt(position);
  if (length <= radius * 2) return { text: model.getValue(), offset };

  const startOffset = Math.max(0, offset - radius);
  const endOffset = Math.min(length, offset + radius);
  // Whole lines only: start at the beginning of the first line in the range.
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);
  const from = { lineNumber: start.lineNumber, column: 1 };
  const to = { lineNumber: end.lineNumber, column: model.getLineMaxColumn(end.lineNumber) };
  const text = model.getValueInRange({ startLineNumber: from.lineNumber, startColumn: 1, endLineNumber: to.lineNumber, endColumn: to.column });
  return { text, offset: offset - model.getOffsetAt({ lineNumber: from.lineNumber, column: 1 }) };
}

function kindMap(monaco: Monaco): Record<CandidateKind, languages.CompletionItemKind> {
  const K = monaco.languages.CompletionItemKind;
  return {
    keyword: K.Keyword,
    function: K.Function,
    method: K.Method,
    class: K.Class,
    type: K.TypeParameter,
    variable: K.Variable,
    constant: K.Constant,
    property: K.Property,
    snippet: K.Snippet,
    module: K.Module,
    text: K.Text,
  };
}

/**
 * Register one completion provider for every supported language.
 * Returns a disposable that removes it again (HMR / StrictMode safe).
 */
export function registerCompletionProviders(monaco: Monaco): IDisposable {
  const kinds = kindMap(monaco);
  const Invoke = monaco.languages.CompletionTriggerKind.Invoke;
  const SnippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  return monaco.languages.registerCompletionItemProvider(COMPLETION_LANGUAGES, {
    triggerCharacters: TRIGGER_CHARACTERS,
    provideCompletionItems(model, position, context, token) {
      if (token.isCancellationRequested) return { suggestions: [] };
      const { text, offset } = documentWindow(model, position);
      const result = buildCompletions(model.getLanguageId(), text, offset, {
        explicit: context.triggerKind === Invoke,
        triggerCharacter: context.triggerCharacter,
      });
      if (result.candidates.length === 0) return { suggestions: [] };

      const startColumn = position.column - result.replaceBefore;
      const insert = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: position.column,
      };
      const range =
        result.replaceAfter > 0 ? { insert, replace: { ...insert, endColumn: position.column + result.replaceAfter } } : insert;

      return {
        suggestions: result.candidates.map((c) => ({
          label: c.label,
          kind: kinds[c.kind],
          insertText: c.insertText,
          insertTextRules: c.isSnippet ? SnippetRule : undefined,
          detail: c.detail,
          documentation: c.documentation ? { value: "```\n" + c.documentation + "\n```" } : undefined,
          filterText: c.filterText,
          sortText: c.sortText,
          range,
        })),
      };
    },
  });
}

/** Indentation unit of a model ("\t" or N spaces). */
export function indentUnitOf(model: editor.ITextModel): string {
  const o = model.getOptions();
  return o.insertSpaces ? " ".repeat(Math.max(1, o.indentSize)) : "\t";
}

/** Command run after a multi-line suggestion is accepted (snippet session or caret placement). */
export const INLINE_CARET_COMMAND = "zuup.inlineSuggest.placeCaret";

/** What to do once a multi-line suggestion has been inserted as plain text. */
export interface InlineAcceptAction {
  lineNumber: number;
  /** 1-based column where the inserted text starts. */
  startColumn: number;
  /** The plain text that was inserted (used to verify the document before touching it). */
  text: string;
  /** Re-insert the text as this snippet (same rendering, absolute indentation) to get tab stops. */
  snippet?: string;
  /** Otherwise move the caret to this offset inside `text`. */
  caret?: number;
}

export interface InlineItemShape {
  insertText: string | { snippet: string };
  /** 1-based columns of the replaced range on the cursor line. */
  startColumn: number;
  endColumn: number;
  /** Follow-up after a multi-line suggestion is accepted. */
  accept?: InlineAcceptAction;
}

/**
 * Map an engine suggestion to what Monaco is given.
 *
 * Monaco previews a snippet as its raw text but inserts it through the snippet controller, which
 * re-indents every line after the first. For a multi-line suggestion the ghost text would then not
 * match what lands in the document, so those are sent as plain text with absolute indentation (exactly
 * what is previewed is inserted). Afterwards the accept command swaps that text for the equivalent,
 * already-indented snippet (so placeholders can be tabbed through), or moves the caret to the snippet's
 * final position. Single-line snippets are unaffected by re-indentation and keep their tab stops.
 */
export function toInlineItem(s: InlineSuggestion, lineNumber: number, column: number): InlineItemShape {
  const startColumn = column - s.replaceBefore;
  const endColumn = column + (s.replaceAfter ?? 0);
  if (!s.multiline) {
    return { insertText: s.snippet !== undefined ? { snippet: s.snippet } : s.insertText, startColumn, endColumn };
  }
  let accept: InlineAcceptAction | undefined;
  if (s.absoluteSnippet !== undefined) accept = { lineNumber, startColumn, text: s.insertText, snippet: s.absoluteSnippet };
  else if (s.caret < s.insertText.length) accept = { lineNumber, startColumn, text: s.insertText, caret: s.caret };
  return { insertText: s.insertText, startColumn, endColumn, accept };
}

/**
 * Re-expresses a suggestion computed on a document where the suggest widget's selected item was
 * already applied, so Monaco shows it as an extension of that item (it must start where the item's
 * range starts and its text must begin with the item's text).
 *
 * Offsets are into the virtual text: `itemStart` is where the item's range starts, `cursor` is right
 * after the item's text, `replacedLength` is how many real characters the item's range covers.
 * The result is relative to the item's start column.
 */
export function rebaseOnSelectedItem(
  s: InlineSuggestion,
  virtualText: string,
  cursor: number,
  itemStart: number,
  itemText: string,
  replacedLength: number,
): InlineSuggestion | null {
  const start = cursor - s.replaceBefore;
  let insertText = s.insertText;
  let lead = 0;
  let caret = s.caret;
  let absoluteSnippet = s.absoluteSnippet;
  if (start > itemStart) {
    const gap = virtualText.slice(itemStart, start);
    insertText = gap + insertText;
    caret += gap.length;
    if (absoluteSnippet !== undefined) absoluteSnippet = escapeSnippet(gap) + absoluteSnippet;
  } else {
    lead = itemStart - start;
    if (!insertText.startsWith(virtualText.slice(start, itemStart))) return null;
  }
  const extension = insertText.slice(lead);
  if (!extension.startsWith(itemText) || extension.length <= itemText.length) return null;
  return {
    ...s,
    insertText,
    caret,
    absoluteSnippet,
    // Single-line snippets would be inserted relative to the item, keep them plain.
    snippet: s.multiline ? s.snippet : undefined,
    replaceBefore: lead,
    replaceAfter: replacedLength + (s.replaceAfter ?? 0),
  };
}

/**
 * Ghost-text provider backed by an `InlineEngine`. `isEnabled` is consulted on
 * every request so the Settings toggle takes effect immediately.
 */
export function registerInlineCompletions(
  monaco: Monaco,
  isEnabled: () => boolean,
  engine: InlineEngine = defaultInlineEngine,
): IDisposable {
  const Explicit = monaco.languages.InlineCompletionTriggerKind.Explicit;

  const acceptCommand = monaco.editor.registerCommand(
    INLINE_CARET_COMMAND,
    (_accessor: unknown, uri: string, action: InlineAcceptAction) => {
      const target = monaco.editor
        .getEditors()
        .find((e) => e.hasTextFocus() && e.getModel()?.uri.toString() === uri);
      const model = target?.getModel();
      if (!target || !model || !action) return;
      const start = model.getOffsetAt({ lineNumber: action.lineNumber, column: action.startColumn });
      const end = start + action.text.length;
      const from = model.getPositionAt(start);
      const to = model.getPositionAt(end);
      const range = { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column };
      // The document must still hold exactly what was accepted.
      if (model.getValueInRange(range, monaco.editor.EndOfLinePreference.LF) !== action.text) return;

      if (action.snippet !== undefined) {
        const controller = target.getContribution("snippetController2") as SnippetControllerLike | null;
        if (controller && typeof controller.insert === "function") {
          target.setSelection(range);
          controller.insert(action.snippet, {
            overwriteBefore: 0,
            overwriteAfter: 0,
            adjustWhitespace: false,
            undoStopBefore: false,
            undoStopAfter: true,
          });
          return;
        }
      }
      if (action.caret !== undefined) target.setPosition(model.getPositionAt(start + action.caret));
    },
  );

  const provider = monaco.languages.registerInlineCompletionsProvider("*", {
    async provideInlineCompletions(model, position, context, token) {
      if (!isEnabled() || token.isCancellationRequested) return { items: [] };

      const win = documentWindow(model, position, INLINE_WINDOW_CHARS);
      const windowStart = model.getOffsetAt(position) - win.offset;
      const request = {
        languageId: model.getLanguageId(),
        indentUnit: indentUnitOf(model),
        explicit: context.triggerKind === Explicit,
      };

      // While the suggest widget has a selection, extend that item instead of competing with it.
      const selected = context.selectedSuggestionInfo;
      if (selected) {
        const r = selected.range;
        if (selected.isSnippetText || selected.text.includes("\n") || r.startLineNumber !== r.endLineNumber) return { items: [] };
        if (r.startLineNumber !== position.lineNumber) return { items: [] };
        const itemStart = model.getOffsetAt({ lineNumber: r.startLineNumber, column: r.startColumn }) - windowStart;
        const itemEnd = model.getOffsetAt({ lineNumber: r.endLineNumber, column: r.endColumn }) - windowStart;
        if (itemStart < 0 || itemEnd > win.text.length || itemEnd < itemStart) return { items: [] };
        const virtualText = win.text.slice(0, itemStart) + selected.text + win.text.slice(itemEnd);
        const cursor = itemStart + selected.text.length;
        const suggestions = await engine.suggest({ ...request, text: virtualText, offset: cursor }, token);
        if (token.isCancellationRequested) return { items: [] };
        const rebased = suggestions
          .map((s) => rebaseOnSelectedItem(s, virtualText, cursor, itemStart, selected.text, itemEnd - itemStart))
          .filter((s): s is InlineSuggestion => s !== null);
        return { items: rebased.map((s) => toMonacoItem(model.uri.toString(), toInlineItem(s, r.startLineNumber, r.startColumn), r.startLineNumber)) };
      }

      const suggestions = await engine.suggest({ ...request, text: win.text, offset: win.offset }, token);
      if (token.isCancellationRequested) return { items: [] };
      const uri = model.uri.toString();
      return {
        items: suggestions.map((s) => toMonacoItem(uri, toInlineItem(s, position.lineNumber, position.column), position.lineNumber)),
        enableForwardStability: true,
      };
    },
    disposeInlineCompletions() {
      /* nothing to release: suggestions are plain data */
    },
  });

  return {
    dispose() {
      provider.dispose();
      acceptCommand.dispose();
    },
  };
}

interface SnippetControllerLike {
  insert(
    template: string,
    opts: { overwriteBefore: number; overwriteAfter: number; adjustWhitespace: boolean; undoStopBefore: boolean; undoStopAfter: boolean },
  ): void;
}

/** Characters read around the cursor for ghost text (the engine never looks at more). */
const INLINE_WINDOW_CHARS = Math.floor(MAX_ENGINE_CHARS / 2);

function toMonacoItem(uri: string, item: InlineItemShape, lineNumber: number): languages.InlineCompletion {
  return {
    insertText: item.insertText,
    range: { startLineNumber: lineNumber, endLineNumber: lineNumber, startColumn: item.startColumn, endColumn: item.endColumn },
    command: item.accept ? { id: INLINE_CARET_COMMAND, title: "Finish suggestion", arguments: [uri, item.accept] } : undefined,
  };
}
