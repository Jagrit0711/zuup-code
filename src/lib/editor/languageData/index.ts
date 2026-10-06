import type { LangData } from "./types";
import { c, cpp, go, rust } from "./native";
import { csharp, dart, java, kotlin, scala, swift } from "./managed";
import { css, html, javascript, json, php, typescript } from "./web";
import { clojure, elixir, haskell, lua, nim, perl, python, r, ruby, shell } from "./scripting";
import { markdown, sql, xml, yaml } from "./markup";

export type { LangData, SnippetDef, DeclRule, InlineRule, BlockRule, RuleContext, SymbolKind } from "./types";

const ALL: LangData[] = [
  python, c, cpp, java, javascript, typescript, go, rust, html, css, json, markdown,
  php, ruby, swift, csharp, kotlin, shell, lua, perl, r, scala, haskell, clojure, dart, elixir, nim, sql, yaml, xml,
];

/** Spellings other than the canonical Monaco id that should resolve to the same data. */
const ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  "c++": "cpp",
  cc: "cpp",
  js: "javascript",
  jsx: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "typescript",
  cs: "csharp",
  "c#": "csharp",
  rs: "rust",
  kt: "kotlin",
  rb: "ruby",
  md: "markdown",
  yml: "yaml",
  hs: "haskell",
  clj: "clojure",
  ex: "elixir",
  pl: "perl",
  bash: "shell",
  sh: "shell",
  zsh: "shell",
  golang: "go",
  htm: "html",
};

const BY_ID = new Map<string, LangData>(ALL.map((l) => [l.id, l]));

/** Normalise any language spelling to a canonical id (lower-cased). */
export function canonicalLanguageId(id: string): string {
  const lower = id.toLowerCase();
  return ALIASES[lower] ?? lower;
}

/** Language data for a Monaco language id or common alias; undefined for plain text. */
export function getLanguageData(id: string): LangData | undefined {
  return BY_ID.get(canonicalLanguageId(id));
}

/** Canonical ids that have completion data. */
export const SUPPORTED_LANGUAGE_IDS: readonly string[] = ALL.map((l) => l.id);
