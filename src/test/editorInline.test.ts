import { describe, expect, it } from "vitest";
import { rebaseOnSelectedItem, toInlineItem } from "@/lib/editor/monacoProviders";
import { renderSnippet } from "@/lib/editor/snippet";
import {
  createInlineEngine,
  defaultInlineEngine,
  isSubsequence,
  MAX_SUGGESTIONS,
  type InlineProvider,
  type InlineSuggestion,
} from "@/lib/editor/inlineSuggest";

const FOUR = "    ";

/** Suggestions at the `|` marker. */
async function suggest(lang: string, source: string, indentUnit = FOUR, explicit = false): Promise<InlineSuggestion[]> {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  return defaultInlineEngine.suggest({ languageId: lang, text, offset, indentUnit, explicit });
}

/** The text that appears as ghost text after the typed prefix. */
async function ghost(lang: string, source: string, indentUnit = FOUR): Promise<string | undefined> {
  const s = (await suggest(lang, source, indentUnit))[0];
  return s?.insertText;
}

describe("isSubsequence", () => {
  it("matches ordered characters", () => {
    expect(isSubsequence("clg", "console.log(")).toBe(true);
    expect(isSubsequence("gcl", "console.log(")).toBe(false);
    expect(isSubsequence("", "x")).toBe(true);
  });
});

describe("inline engine: snippet expansion", () => {
  it("expands a typed keyword into a block", async () => {
    const s = (await suggest("python", "for|"))[0];
    expect(s.insertText).toBe("for item in items:\n    pass");
    expect(s.replaceBefore).toBe(3);
    expect(s.multiline).toBe(true);
    expect(s.snippet).toContain("${1:item}");
  });

  it("indents multi-line expansions relative to the cursor line", async () => {
    const s = (await suggest("python", "def f():\n    for|"))[0];
    expect(s.insertText).toBe("for item in items:\n        pass");
  });

  it("uses tabs when the editor indents with tabs", async () => {
    const s = (await suggest("go", "func main() {\n\tfor|", "\t"))[0];
    expect(s.insertText.startsWith("for i := 0; i < n; i++ {\n\t\t")).toBe(true);
  });

  it("supports alias prefixes such as clg -> console.log", async () => {
    expect(await ghost("javascript", "clg|")).toBe("console.log();");
    expect(await ghost("javascript", "console.l|")).toBe("console.log();");
  });

  it("completes main for C, Java and Go", async () => {
    expect(await ghost("c", "main|")).toContain("int main(void) {");
    expect(await ghost("java", "main|")).toContain("public static void main(String[] args) {");
    expect(await ghost("go", "func main|")).toBe("func main() {\n    \n}");
  });

  it("does not suggest below the minimum length", async () => {
    expect(await suggest("python", "f|")).toEqual([]);
  });

  it("returns at most MAX_SUGGESTIONS items", async () => {
    const res = await suggest("python", "pr|", FOUR, true);
    expect(res.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });

  it("covers every language in the product list", async () => {
    const cases: [string, string][] = [
      ["php", "foreach|"],
      ["ruby", "def|"],
      ["swift", "func|"],
      ["csharp", "foreach|"],
      ["kotlin", "fun|"],
      ["shell", "for|"],
      ["lua", "function|"],
      ["perl", "foreach|"],
      ["r", "function|"],
      ["scala", "def|"],
      ["haskell", "main|"],
      ["clojure", "defn|"],
      ["dart", "main|"],
      ["elixir", "defmodule|"],
      ["nim", "proc|"],
      ["sql", "select|"],
      ["yaml", "anchor|"],
      ["xml", "xml|"],
      ["rust", "fn|"],
      ["cpp", "cout|"],
      ["typescript", "interface|"],
      ["html", "script|"],
      ["css", "flex|"],
    ];
    for (const [lang, src] of cases) {
      expect((await suggest(lang, src)).length, `${lang}: ${src}`).toBeGreaterThan(0);
    }
  });
});

describe("inline engine: language rules", () => {
  it("completes a python function header with a body", async () => {
    expect(await ghost("python", "def greet|")).toBe("def greet():\n    ");
  });

  it("completes python class headers and loops", async () => {
    expect(await ghost("python", "class Dog|")).toBe("class Dog:\n    def __init__(self):\n        ");
    expect(await ghost("python", "for i in |")).toBe("for i in range(n):\n    ");
    expect(await ghost("python", "for name in names|")).toBe("for name in names:\n    ");
  });

  it("adds the missing colon to python statements", async () => {
    expect(await ghost("python", "if x > 3|")).toBe("if x > 3:\n    ");
    expect(await ghost("python", "else|")).toBe("else:\n    ");
    expect(await ghost("python", "if x > 3 and|")).toBeUndefined();
    expect(await ghost("python", "while (a < b|")).toBeUndefined();
    expect(await ghost("python", "def add(a, b)|")).toBe("def add(a, b):\n    ");
  });

  it("suggests common python import aliases", async () => {
    expect(await ghost("python", "import numpy|")).toBe("import numpy as np");
    expect(await ghost("python", "import pandas|")).toBe("import pandas as pd");
    expect(await ghost("python", "import matplotlib.pyplot|")).toBe("import matplotlib.pyplot as plt");
  });

  it("completes the main guard", async () => {
    expect(await ghost("python", "if __na|")).toBe('if __name__ == "__main__":\n    ');
  });

  it("completes C and C++ includes", async () => {
    expect(await ghost("c", "#include <std|")).toBe("#include <stdio.h>");
    expect(await ghost("cpp", "#include <ios|")).toBe("#include <iostream>");
    expect(await ghost("cpp", "#include|")).toBe("#include <iostream>");
  });

  it("completes Rust, Go and Java declarations", async () => {
    expect(await ghost("rust", "fn helper|")).toBe("fn helper() {\n    \n}");
    expect(await ghost("rust", "fn main|")).toBe("fn main() {\n    \n}");
    expect(await ghost("go", "func helper|")).toBe("func helper() {\n    \n}");
    expect(await ghost("java", "public class App|")).toBe("public class App {\n    \n}");
  });

  it("starts a Go file with the main program only when the file is empty", async () => {
    expect(await ghost("go", "package|")).toContain("func main()");
    expect(await ghost("go", "// header\nvar x = 1\npackage|")).toBe("package main");
  });

  it("completes JS / TS declarations and require", async () => {
    expect(await ghost("javascript", "function add|")).toBe("function add() {\n    \n}");
    expect(await ghost("typescript", "interface User|")).toBe("interface User {\n    \n}");
    expect(await ghost("javascript", "const fs = require(|")).toBe('const fs = require("fs");');
  });

  it("closes bash for loops and ifs", async () => {
    expect(await ghost("shell", "for f in *.txt|")).toBe("for f in *.txt; do\n    \ndone");
  });
});

describe("inline engine: block bodies", () => {
  it("proposes attribute assignments for __init__", async () => {
    const s = await ghost("python", "class P:\n    def __init__(self, name, age):\n        |");
    expect(s).toBe("self.name = name\n        self.age = age");
  });

  it("proposes the main() call under the main guard when main exists", async () => {
    expect(await ghost("python", 'def main():\n    pass\n\nif __name__ == "__main__":\n    |')).toBe("main()");
    expect(await ghost("python", 'if __name__ == "__main__":\n    |')).toBeUndefined();
  });

  it("proposes loop bodies using the loop variable", async () => {
    expect(await ghost("python", "for item in items:\n    |")).toBe("print(item)");
    expect(await ghost("javascript", "for (let i = 0; i < 3; i++) {\n    |\n}")).toBe("console.log(i);");
    expect(await ghost("go", "func main() {\n\tfmt.Println(\"x\")\n\tfor i := 0; i < 3; i++ {\n\t\t|\n\t}\n}", "\t")).toBe("fmt.Println(i)");
  });

  it("fills main() bodies depending on the includes", async () => {
    const c = await ghost("c", "#include <stdio.h>\n\nint main() {\n    |\n}");
    expect(c).toBe('printf("Hello, World!\\n");\n    return 0;');
    expect(await ghost("c", "int main() {\n    |\n}")).toBe("return 0;");
    expect(await ghost("rust", "fn main() {\n    |\n}")).toBe('println!("Hello, World!");');
  });

  it("does not repeat a body that already exists below the cursor", async () => {
    expect(await ghost("python", "for item in items:\n    |\n    print(item)")).toBeUndefined();
  });

  it("stays quiet when the cursor line is not indented deeper than the opener", async () => {
    expect(await ghost("python", "for item in items:\n|")).toBeUndefined();
  });
});

describe("inline engine: repeating earlier lines", () => {
  it("finishes the line like the nearest earlier line", async () => {
    const src = "total = compute_the_total(values, weights)\nprint(total)\ntot|";
    expect(await ghost("python", src)).toBe("total = compute_the_total(values, weights)");
  });

  it("prefers the nearest match and lists distinct alternatives", async () => {
    const src = "result = foo(1)\nresult = bar(2)\nres|";
    const res = await suggest("python", src);
    expect(res.map((s) => s.insertText)).toEqual(["result = bar(2)", "result = foo(1)"]);
  });

  it("matches irrespective of indentation and keeps the cursor indentation", async () => {
    const src = "def f():\n    value = load_everything()\n\ndef g():\n    val|";
    const s = (await suggest("python", src))[0];
    expect(s.insertText).toBe("value = load_everything()");
    expect(s.replaceBefore).toBe(3);
  });

  it("looks ahead of the cursor too", async () => {
    expect(await ghost("python", 'print(|\nprint("later line")')).toBe('print("later line")');
  });

  it("needs three typed characters and ignores comment lines", async () => {
    expect(await suggest("python", "value_one = 1\nva|")).toEqual([]);
    expect(await suggest("python", "# value_one = 1\nvalue_|")).toEqual([]);
  });

  it("never suggests exactly what is already typed", async () => {
    expect(await suggest("python", "print(1)\nprint(1)|")).toEqual([]);
  });

  it("escapes snippet syntax in repeated lines", async () => {
    const s = (await suggest("javascript", "const cost = `$${price}`;\nconst co|"))[0];
    expect(s.insertText).toBe("const cost = `$${price}`;");
    expect(s.snippet).toBeUndefined();
  });

  it("repeats lines in data and prose languages", async () => {
    expect(await ghost("markdown", "- [ ] buy milk today\n- [ ] bu|")).toBe("- [ ] buy milk today");
    expect(await ghost("json", '{\n  "a": 1,\n  "b": [1, 2, 3]\n}\n{\n  "b|')).toBeUndefined();
    expect(await ghost("yaml", "image: nginx:latest\nimage: ng|")).toBe("image: nginx:latest");
  });

  it("works for languages without language data", async () => {
    expect(await ghost("plaintext", "Dear customer, thanks!\nDear c|")).toBe("Dear customer, thanks!");
  });
});

describe("inline engine: gating", () => {
  it("is silent inside comments and strings", async () => {
    expect(await suggest("python", "# for|")).toEqual([]);
    expect(await suggest("python", 'x = "for|')).toEqual([]);
    expect(await suggest("c", "/* main|")).toEqual([]);
  });

  it("is silent when text follows the cursor", async () => {
    expect(await suggest("python", "for|x")).toEqual([]);
    expect(await suggest("python", "print(|)")).toEqual([]);
  });

  it("is silent on an empty document", async () => {
    expect(await suggest("python", "|")).toEqual([]);
  });

  it("allows trailing whitespace after the cursor for single-line suggestions only", async () => {
    expect((await suggest("python", "import numpy|  ")).length).toBeGreaterThan(0);
    // Multi-line ghost text must end at the very end of the line.
    expect(await suggest("python", "for|   ")).toEqual([]);
  });
});

describe("inline engine: providers and cancellation", () => {
  it("lets an extra provider (e.g. a future AI backend) contribute", async () => {
    const ai: InlineProvider = {
      id: "fake-ai",
      async provide(ctx) {
        return [{ replaceBefore: ctx.trimmedPrefix.length, snippet: ctx.trimmedPrefix + " AI", score: 99, source: "ai" }];
      },
    };
    const engine = createInlineEngine([ai]);
    const res = await engine.suggest({ languageId: "python", text: "hello", offset: 5, indentUnit: FOUR });
    expect(res[0].source).toBe("ai");
    expect(res[0].insertText).toBe("hello AI");
  });

  it("survives a provider that throws", async () => {
    const bad: InlineProvider = {
      id: "bad",
      provide() {
        throw new Error("boom");
      },
    };
    const good: InlineProvider = {
      id: "good",
      provide: () => [{ replaceBefore: 1, snippet: "abc", score: 1, source: "good" }],
    };
    const res = await createInlineEngine([bad, good]).suggest({ languageId: "python", text: "a", offset: 1, indentUnit: FOUR });
    expect(res).toHaveLength(1);
  });

  it("drops suggestions that do not contain the typed text", async () => {
    const wrong: InlineProvider = {
      id: "wrong",
      provide: () => [{ replaceBefore: 3, snippet: "xyz", score: 1, source: "wrong" }],
    };
    const res = await createInlineEngine([wrong]).suggest({ languageId: "python", text: "abc", offset: 3, indentUnit: FOUR });
    expect(res).toEqual([]);
  });

  it("returns nothing when cancelled", async () => {
    const res = await defaultInlineEngine.suggest(
      { languageId: "python", text: "for", offset: 3, indentUnit: FOUR },
      { isCancellationRequested: true },
    );
    expect(res).toEqual([]);
  });

  it("stops scanning when cancelled mid-way", async () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `line_${i} = ${i}`);
    const text = lines.join("\n") + "\nzzz_unmatched";
    let checks = 0;
    const token = {
      get isCancellationRequested() {
        checks++;
        return checks > 3;
      },
    };
    const res = await defaultInlineEngine.suggest({ languageId: "python", text, offset: text.length, indentUnit: FOUR }, token);
    expect(res).toEqual([]);
  });
});

describe("inline engine: performance bounds", () => {
  it("answers quickly on a 50k line document", async () => {
    const lines = Array.from({ length: 50000 }, (_, i) => `value_${i} = compute(${i}, "x")`);
    const text = lines.join("\n") + "\nval";
    const start = performance.now();
    const res = await defaultInlineEngine.suggest({ languageId: "python", text, offset: text.length, indentUnit: FOUR });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(800);
    expect(res.length).toBeGreaterThan(0);
  });

  it("ignores absurdly long lines", async () => {
    const long = "x".repeat(5000);
    const res = await defaultInlineEngine.suggest({ languageId: "python", text: long, offset: long.length, indentUnit: FOUR });
    expect(res).toEqual([]);
  });
});

describe("toInlineItem (Monaco adapter mapping)", () => {
  const base = { score: 80, source: "test" };

  it("keeps tab stops for single-line snippets", () => {
    const item = toInlineItem(
      { ...base, replaceBefore: 3, insertText: "for (let i = 0; i < n; i++)", snippet: "for (let ${1:i} = 0; $1 < n; $1++)", caret: 9, multiline: false },
      4,
      10,
    );
    expect(item).toEqual({ insertText: { snippet: "for (let ${1:i} = 0; $1 < n; $1++)" }, startColumn: 7, endColumn: 10 });
  });

  it("sends multi-line suggestions as plain, already-indented text so the preview matches the insert", () => {
    const insertText = "if (ok) {\n    \n  }";
    const item = toInlineItem(
      { ...base, replaceBefore: 2, insertText, snippet: "if (${1:ok}) {\n\t$0\n}", caret: 14, multiline: true },
      7,
      5,
    );
    expect(item.insertText).toBe(insertText);
    expect(item.startColumn).toBe(3);
    expect(item.accept).toEqual({ lineNumber: 7, startColumn: 3, text: insertText, caret: 14 });
  });

  it("re-inserts multi-line suggestions with tab stops as an equivalent, pre-indented snippet", async () => {
    const s = (await suggest("javascript", "function f() {\n    for|", FOUR))[0];
    expect(s.absoluteSnippet).toBeDefined();
    // The snippet renders to exactly the previewed ghost text (Monaco must not re-indent it).
    expect(renderSnippet(s.absoluteSnippet!).text).toBe(s.insertText);
    const item = toInlineItem(s, 2, 8);
    expect(item.insertText).toBe(s.insertText);
    expect(item.accept).toEqual({ lineNumber: 2, startColumn: 5, text: s.insertText, snippet: s.absoluteSnippet });
  });

  it("needs no follow-up when the caret ends up at the end anyway", () => {
    const insertText = "def f():\n    pass";
    const item = toInlineItem({ ...base, replaceBefore: 0, insertText, caret: insertText.length, multiline: true }, 1, 1);
    expect(item.accept).toBeUndefined();
  });

  it("replaces auto-closed text after the cursor", async () => {
    const s = (await suggest("python", "def foo(|)"))[0];
    const item = toInlineItem(s, 1, 9);
    expect(item).toMatchObject({ insertText: "def foo():\n    ", startColumn: 1, endColumn: 10 });
  });
});

describe("rebaseOnSelectedItem (ghost text while the suggest widget is open)", () => {
  it("extends the selected item from the item's start", async () => {
    // Typed `whi`, the widget selected `while` (range covers `whi`).
    const virtualText = "while";
    const s = (await defaultInlineEngine.suggest({ languageId: "python", text: virtualText, offset: 5, indentUnit: FOUR }))[0];
    expect(s.insertText).toBe("while condition:\n    pass");
    const r = rebaseOnSelectedItem(s, virtualText, 5, 0, "while", 3);
    expect(r).toMatchObject({ insertText: "while condition:\n    pass", replaceBefore: 0, replaceAfter: 3 });
    const item = toInlineItem(r!, 1, 1);
    expect(item.startColumn).toBe(1);
    expect(item.endColumn).toBe(4);
  });

  it("keeps text between the item start and the suggestion start", async () => {
    const virtualText = "console.log";
    const s = (await defaultInlineEngine.suggest({ languageId: "javascript", text: virtualText, offset: 11, indentUnit: FOUR }))[0];
    // Item `log` replaced `lo` after `console.`.
    const r = rebaseOnSelectedItem(s, virtualText, 11, 8, "log", 2);
    expect(r).toMatchObject({ insertText: "console.log();", replaceBefore: 8, replaceAfter: 2 });
  });

  it("drops suggestions that do not extend the item", () => {
    const s = { replaceBefore: 3, insertText: "abc", caret: 3, multiline: false, score: 1, source: "x" };
    expect(rebaseOnSelectedItem(s, "abc", 3, 0, "abc", 3)).toBeNull();
    expect(rebaseOnSelectedItem({ ...s, insertText: "abd!" }, "abc", 3, 0, "abc", 3)).toBeNull();
  });
});

/**
 * Regression table from the review of real typing sequences: [language, source with | as cursor,
 * expected first ghost text or null for "stay quiet"].
 */
const TYPING_CASES: [string, string, string | null][] = [
  // Auto-closed brackets no longer block suggestions...
  ["python", "def foo(|)", "def foo():\n    "],
  ["python", "if foo(x|)", "if foo(x):\n    "],
  ["python", "for i in range(10|)", "for i in range(10):\n    "],
  // ...but a plain call stays quiet.
  ["python", "print(|)", null],
  ["javascript", "console.log(|);", null],
  ["java", "System.out.println(|);", null],
  // Python loops and colons.
  ["python", "for i in range(10)|", "for i in range(10):\n    "],
  ["python", "for k, v in d.items()|", "for k, v in d.items():\n    "],
  ["python", "for i in|", "for i in range(n):\n    "],
  ["python", "names = []\nif n|", null],
  ["python", "items = []\nfor x in it|", null],
  ["python", "if __n|", 'if __name__ == "__main__":\n    '],
  // Identifier prefixes must not expand into unrelated snippets.
  ["javascript", "ma|", null],
  ["javascript", "re|", null],
  ["javascript", "el|", null],
  ["javascript", "ite|", null],
  ["javascript", "con|", null],
  ["javascript", "const|", null],
  ["javascript", "fo|", null],
  ["python", "wh|", null],
  ["python", "whi|", "while condition:\n    pass"],
  ["javascript", "console.lo|", "console.log();"],
  ["java", "System.out.p|", "System.out.println();"],
  ["java", "public static void m|", "public static void main(String[] args) {\n    \n}"],
  ["cpp", "int main|", "int main() {\n    \n    return 0;\n}"],
  // Whole-file templates only in an empty file.
  ["html", "<body>\n  ht|\n</body>", null],
  ["go", "x := 1\npack|", null],
  // No duplicate imports / includes.
  ["python", "import os\nimp|", null],
  ["python", "import numpy as np\nimport nu|", null],
  ["java", "import java.util.*;\nimport |", null],
  ["cpp", "#include <iostream>\n#include <|", "#include <vector>"],
];

describe("inline engine: typing regressions", () => {
  it.each(TYPING_CASES)("%s %j", async (lang, source, expected) => {
    const first = (await suggest(lang, source))[0]?.insertText ?? null;
    expect(first).toBe(expected);
  });

  it("offers the HTML5 template in an empty file", async () => {
    expect(await ghost("html", "html|")).toMatch(/^<!DOCTYPE html>/);
  });
});
