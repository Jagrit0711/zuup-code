import type * as MonacoNs from "monaco-editor";
import { getLanguageData } from "./languageData";
import type { LangData } from "./languageData/types";
import { words } from "./languageData/types";

type MonacoApi = typeof MonacoNs;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Minimal Monarch grammar derived from the language data (comments, strings,
 * numbers, keywords, types). Used for languages Monaco does not ship.
 */
function buildTokenizer(data: LangData): MonacoNs.languages.IMonarchLanguage {
  const lineComments = data.syntax.lineComments.map((c) => new RegExp(`${escapeRe(c)}.*$`));
  const block = data.syntax.blockComments?.[0];
  const root: MonacoNs.languages.IMonarchLanguageRule[] = [];

  if (block) root.push([new RegExp(escapeRe(block[0])), "comment", "@comment"]);
  for (const re of lineComments) root.push([re, "comment"]);
  root.push([/"/, "string", "@string"]);
  root.push([/'(?:\\.|[^\\'])'/, "string"]);
  root.push([/0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/, "number"]);
  root.push([
    /[A-Za-z_][\w']*/,
    { cases: { "@keywords": "keyword", "@constants": "constant", "@types": "type", "@default": "identifier" } },
  ]);
  root.push([/[{}()[\]]/, "@brackets"]);
  root.push([/[-+*/%=<>!&|^~?:.,;@$\\]+/, "operator"]);

  return {
    defaultToken: "",
    keywords: words(data.keywords),
    constants: words(data.constants),
    types: words(data.types),
    tokenizer: {
      root,
      comment: block
        ? [
            [new RegExp(`[^${escapeRe(block[0][0])}${escapeRe(block[1][0])}]+`), "comment"],
            [new RegExp(escapeRe(block[1])), "comment", "@pop"],
            [/./, "comment"],
          ]
        : [[/./, "comment", "@pop"]],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  };
}

const EXTRA_LANGUAGES: { id: string; extensions: string[]; aliases: string[] }[] = [
  { id: "haskell", extensions: [".hs", ".lhs"], aliases: ["Haskell", "haskell"] },
  { id: "nim", extensions: [".nim", ".nims"], aliases: ["Nim", "nim"] },
];

/**
 * Register syntax highlighting for languages Monaco does not include, so
 * files of those types get comments, strings and keywords highlighted.
 */
export function registerExtraLanguages(monaco: MonacoApi): MonacoNs.IDisposable[] {
  const disposables: MonacoNs.IDisposable[] = [];
  const existing = new Set(monaco.languages.getLanguages().map((l) => l.id));

  for (const lang of EXTRA_LANGUAGES) {
    if (existing.has(lang.id)) continue;
    const data = getLanguageData(lang.id);
    if (!data) continue;
    monaco.languages.register({ id: lang.id, extensions: lang.extensions, aliases: lang.aliases });
    disposables.push(monaco.languages.setMonarchTokensProvider(lang.id, buildTokenizer(data)));
    const block = data.syntax.blockComments?.[0];
    disposables.push(
      monaco.languages.setLanguageConfiguration(lang.id, {
        comments: { lineComment: data.syntax.lineComments[0], blockComment: block },
        brackets: [
          ["{", "}"],
          ["[", "]"],
          ["(", ")"],
        ],
        autoClosingPairs: [
          { open: "{", close: "}" },
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: '"', close: '"', notIn: ["string", "comment"] },
        ],
        surroundingPairs: [
          { open: "{", close: "}" },
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: '"', close: '"' },
        ],
        indentationRules:
          lang.id === "nim"
            ? { increaseIndentPattern: /(?::|=)\s*$/, decreaseIndentPattern: /^\s*(?:else|elif|except|finally|of)\b/ }
            : { increaseIndentPattern: /(?:\bwhere|\bdo|\bof|=|->)\s*$/, decreaseIndentPattern: /^\s*(?:else|then|in)\b/ },
      }),
    );
  }
  return disposables;
}
