/**
 * Tiny helpers for the subset of VS Code snippet syntax used by the editor
 * data tables: `$1`, `${1}`, `${1:default}` (nestable), `$0` and the escapes
 * `\$`, `\}` and `\\`. A literal tab stands for one indentation level.
 */

export interface RenderedSnippet {
  /** Text with placeholders replaced by their defaults. */
  text: string;
  /** Offset of the final cursor position ($0, else the first tab stop, else the end). */
  caret: number;
}

/** Escape plain text so it can be embedded in snippet source. */
export function escapeSnippet(text: string): string {
  return text.replace(/[\\$}]/g, "\\$&");
}

export function renderSnippet(source: string): RenderedSnippet {
  let out = "";
  let finalCaret = -1;
  let firstStop = -1;

  const parse = (i: number, untilBrace: boolean): number => {
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\" && i + 1 < source.length && "\\$}".includes(source[i + 1])) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (untilBrace && ch === "}") return i + 1;
      if (ch === "$") {
        const next = source[i + 1];
        if (next >= "0" && next <= "9") {
          let j = i + 1;
          while (source[j] >= "0" && source[j] <= "9") j++;
          mark(Number(source.slice(i + 1, j)));
          i = j;
          continue;
        }
        if (next === "{") {
          let j = i + 2;
          while (source[j] >= "0" && source[j] <= "9") j++;
          const index = Number(source.slice(i + 2, j));
          if (j > i + 2) {
            mark(index);
            if (source[j] === ":") {
              i = parse(j + 1, true);
              continue;
            }
            if (source[j] === "}") {
              i = j + 1;
              continue;
            }
          }
        }
      }
      out += ch;
      i++;
    }
    return i;
  };

  const mark = (index: number) => {
    if (index === 0) {
      if (finalCaret < 0) finalCaret = out.length;
    } else if (firstStop < 0) {
      firstStop = out.length;
    }
  };

  parse(0, false);
  const caret = finalCaret >= 0 ? finalCaret : firstStop >= 0 ? firstStop : out.length;
  return { text: out, caret };
}

/** Replace tabs with the indent unit and indent every line after the first. */
export function applyIndent(text: string, indent: string, indentUnit: string): string {
  return text
    .split("\n")
    .map((line, i) => {
      const expanded = line.replace(/^\t+/, (tabs) => indentUnit.repeat(tabs.length));
      return i === 0 || expanded.length === 0 ? expanded : indent + expanded;
    })
    .join("\n");
}
