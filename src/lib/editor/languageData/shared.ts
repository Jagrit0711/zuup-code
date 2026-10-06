import type { SyntaxConfig } from "../syntax";
import type { DeclRule } from "./types";

/** Join snippet lines; use "\t" at the start of a line for one indent level. */
export const L = (...lines: string[]) => lines.join("\n");

export const C_SYNTAX: SyntaxConfig = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  quotes: "\"'",
  charLiterals: true,
};

export const JS_SYNTAX: SyntaxConfig = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  quotes: "\"'",
  multilineQuotes: ["`"],
};

export const HASH_SYNTAX: SyntaxConfig = { lineComments: ["#"], quotes: "\"'" };

export const SQL_SYNTAX: SyntaxConfig = {
  lineComments: ["--"],
  blockComments: [["/*", "*/"]],
  quotes: "\"'",
};

/** Words that look like types in TYPED_VARIABLE but are really statements. */
export const NOT_A_TYPE = new Set([
  "return", "else", "case", "throw", "new", "delete", "goto", "break", "continue", "import", "package",
  "using", "namespace", "typedef", "yield", "await", "in", "is", "as", "do", "if", "while", "for",
]);

/** Names declared with `Type name = ...;` style statements (C, Java, C#, ...). */
export const TYPED_VARIABLE: DeclRule = {
  re: /^\s*(?:(?:final|const|static|readonly|unsigned|signed|volatile|var|auto|let)\s+)*([A-Za-z_][\w:]*(?:<[^>()]*>)?(?:\[\])*[*&]*)\s+([A-Za-z_]\w*)\s*(?:=[^=]|;|,|\[)/,
  kind: "variable",
  names: (m) => (NOT_A_TYPE.has(m[1]) ? [] : [m[2]]),
};
