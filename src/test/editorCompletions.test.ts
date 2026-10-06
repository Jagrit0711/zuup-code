import { describe, expect, it } from "vitest";
import { buildCompletions, receiverBefore, type Candidate } from "@/lib/editor/completions";
import { canonicalLanguageId, getLanguageData, SUPPORTED_LANGUAGE_IDS } from "@/lib/editor/languageData";
import { renderSnippet } from "@/lib/editor/snippet";
import { getLanguageSnippets } from "@/lib/monacoSnippets";

/** Run the builder with the cursor at the `|` marker. */
function complete(lang: string, source: string, options: { explicit?: boolean; triggerCharacter?: string } = {}) {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  return buildCompletions(lang, text, offset, options);
}

const labels = (cs: Candidate[]) => cs.map((c) => c.label);

describe("language coverage", () => {
  const required = [
    "python", "c", "cpp", "java", "javascript", "typescript", "go", "rust", "html", "css", "json", "markdown",
    "php", "ruby", "swift", "csharp", "kotlin", "shell", "lua", "perl", "r", "scala", "haskell", "clojure",
    "dart", "elixir", "nim", "sql", "yaml", "xml",
  ];

  it("has data for every language the product lists", () => {
    for (const id of required) expect(SUPPORTED_LANGUAGE_IDS, id).toContain(id);
  });

  it("resolves common aliases", () => {
    expect(canonicalLanguageId("bash")).toBe("shell");
    expect(canonicalLanguageId("C++")).toBe("cpp");
    expect(getLanguageData("py")?.id).toBe("python");
    expect(getLanguageData("plaintext")).toBeUndefined();
  });

  it("gives every language a working snippet list with valid snippet bodies", () => {
    for (const id of required) {
      const data = getLanguageData(id)!;
      expect(data.snippets.length, id).toBeGreaterThan(1);
      const prefixes = new Set<string>();
      for (const s of data.snippets) {
        expect(prefixes.has(s.prefix), `${id}: duplicate snippet prefix ${s.prefix}`).toBe(false);
        prefixes.add(s.prefix);
        const r = renderSnippet(s.body);
        expect(r.text.length, `${id}:${s.prefix}`).toBeGreaterThan(0);
        // Unbalanced placeholders would leak "${" into the document.
        expect(r.text, `${id}:${s.prefix}`).not.toMatch(/\$\{\d/);
      }
    }
  });

  it("suggests keywords for languages without a Monaco language service", () => {
    for (const id of ["php", "ruby", "swift", "csharp", "kotlin", "shell", "lua", "perl", "r", "scala", "haskell", "clojure", "dart", "elixir", "nim", "sql"]) {
      const data = getLanguageData(id)!;
      const kw = data.keywords!.split(/\s+/)[0];
      const res = complete(id, `${kw.slice(0, 2)}|`);
      expect(res.candidates.length, id).toBeGreaterThan(5);
    }
  });
});

describe("buildCompletions", () => {
  it("offers nothing inside comments", () => {
    expect(complete("python", "# pri|").candidates).toEqual([]);
    expect(complete("c", "/* pri|").candidates).toEqual([]);
    expect(complete("javascript", "// con|").candidates).toEqual([]);
    expect(complete("rust", "// pri|").candidates).toEqual([]);
  });

  it("offers nothing inside ordinary strings", () => {
    expect(complete("python", 'x = "pri|').candidates).toEqual([]);
    expect(complete("go", 'x := "fm|').candidates).toEqual([]);
    expect(complete("java", 'String s = "Sys|').candidates).toEqual([]);
  });

  it("offers nothing while typing a number", () => {
    expect(complete("python", "x = 12|").candidates).toEqual([]);
    expect(complete("python", "x = 1.|").candidates).toEqual([]);
  });

  it("replaces only the typed word and the rest of the identifier", () => {
    const res = complete("python", "pri|nt(1)");
    expect(res.replaceBefore).toBe(3);
    expect(res.replaceAfter).toBe(2);
    const print = res.candidates.find((c) => c.label === "print" && c.kind === "function");
    // The call already has parentheses, so only the name is inserted.
    expect(print?.insertText).toBe("print");
  });

  it("does not add parentheses when the identifier is already followed by one", () => {
    const res = complete("python", "pr|(1)");
    const fn = res.candidates.find((c) => c.label === "print" && c.kind === "function")!;
    expect(fn.insertText).toBe("print");
    expect(fn.isSnippet).toBe(false);
  });

  it("never lists the same label twice", () => {
    for (const lang of ["python", "c", "cpp", "java", "go", "rust", "csharp", "ruby", "php", "sql"]) {
      const res = complete(lang, "i|", { explicit: true });
      const l = labels(res.candidates);
      expect(new Set(l).size, lang).toBe(l.length);
    }
  });

  it("prefers a snippet over a keyword with the same label", () => {
    const res = complete("python", "fo|");
    const forEntries = res.candidates.filter((c) => c.label === "for");
    expect(forEntries).toHaveLength(1);
    expect(forEntries[0].kind).toBe("snippet");
  });

  it("includes symbols declared in the document and ranks them first", () => {
    const res = complete("python", "def calculate_total(items):\n    return 1\n\nclass Cart:\n    pass\n\ncalc|");
    const total = res.candidates.find((c) => c.label === "calculate_total")!;
    expect(total.kind).toBe("function");
    expect(total.sortText.startsWith("1")).toBe(true);
    expect(total.insertText).toBe("calculate_total($0)");
    const cart = complete("python", "class Cart:\n    pass\nCa|").candidates.find((c) => c.label === "Cart")!;
    expect(cart.kind).toBe("class");
  });

  it("does not suggest the name that is still being typed on its own declaration line", () => {
    const res = complete("python", "foo_value = 1\nfoo_val|");
    expect(labels(res.candidates)).toContain("foo_value");
    const only = complete("python", "total_count|");
    expect(labels(only.candidates)).not.toContain("total_count");
  });

  it("falls back to document words", () => {
    const res = complete("python", "banana_split = 3\nprint(banana_split)\nbana|");
    expect(labels(res.candidates)).toContain("banana_split");
  });

  it("completes members after a known module and nothing else", () => {
    const res = complete("python", "import math\nmath.sq|");
    const l = labels(res.candidates);
    expect(l).toContain("sqrt");
    expect(l).not.toContain("def");
    expect(l).not.toContain("class");
    expect(res.candidates.find((c) => c.label === "sqrt")!.insertText).toBe("sqrt($0)");
  });

  it("completes dotted module chains and C++ / Go / Java packages", () => {
    expect(labels(complete("python", "os.path.|", { triggerCharacter: "." }).candidates)).toContain("join");
    expect(labels(complete("cpp", "std::|", { triggerCharacter: ":" }).candidates)).toContain("vector");
    expect(labels(complete("go", "fmt.|", { triggerCharacter: "." }).candidates)).toContain("Println");
    expect(labels(complete("java", "System.out.|", { triggerCharacter: "." }).candidates)).toContain("println");
  });

  it("does not list keywords after a dot", () => {
    const res = complete("go", "fmt.Pr|");
    expect(labels(res.candidates)).not.toContain("func");
    expect(labels(res.candidates)).not.toContain("chan");
  });

  it("offers members used in the document for unknown receivers", () => {
    const res = complete("python", "class P:\n    def __init__(self):\n        self.health = 1\n    def f(self):\n        self.he|");
    expect(labels(res.candidates)).toContain("health");
    // Common builtin methods are still offered, ranked after real usage.
    const health = res.candidates.find((c) => c.label === "health")!;
    const append = res.candidates.find((c) => c.label === "append")!;
    expect(health.sortText < append.sortText).toBe(true);
  });

  it("does not offer members for service-backed languages (the TS service owns them)", () => {
    expect(complete("typescript", "console.|", { triggerCharacter: "." }).candidates).toEqual([]);
  });

  it("only adds snippets for service-backed languages", () => {
    const res = complete("typescript", "cl|");
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.candidates.every((c) => c.kind === "snippet")).toBe(true);
    expect(labels(res.candidates)).toContain("clg");
  });

  it("completes C include paths with the correct replace range and closer", () => {
    const res = complete("c", "#include <st|", { triggerCharacter: "<" });
    expect(labels(res.candidates)).toEqual(expect.arrayContaining(["stdio.h", "stdlib.h", "string.h"]));
    expect(res.replaceBefore).toBe(2);
    expect(res.candidates.find((c) => c.label === "stdio.h")!.insertText).toBe("stdio.h>");
    // Closer already present: do not duplicate it.
    const closed = buildCompletions("c", "#include <st>", 12);
    expect(closed.candidates.find((c) => c.label === "stdio.h")!.insertText).toBe("stdio.h");
    // Neither keywords nor snippets leak into the include path.
    expect(labels(res.candidates)).not.toContain("struct");
    expect(labels(res.candidates)).not.toContain("main");
  });

  it("completes quoted C includes", () => {
    const res = complete("c", '#include "st|"', { triggerCharacter: '"' });
    expect(res.candidates.find((c) => c.label === "stdio.h")!.insertText).toBe("stdio.h");
  });

  it("completes python and java imports", () => {
    expect(labels(complete("python", "import ma|").candidates)).toContain("math");
    expect(labels(complete("python", "from coll|").candidates)).toContain("collections");
    expect(labels(complete("java", "import java.ut|").candidates)).toContain("java.util.List");
  });

  it("completes node module names inside require/import strings", () => {
    expect(labels(complete("javascript", 'const fs = require("f|', { triggerCharacter: '"' }).candidates)).toContain("fs");
    expect(labels(complete("typescript", 'import path from "pa|').candidates)).toContain("path");
  });

  it("completes go imports in a block only", () => {
    expect(labels(complete("go", 'import (\n\t"fm|').candidates)).toContain("fmt");
    expect(complete("go", 'x := map[string]int{\n\t"fm|').candidates).toEqual([]);
  });

  it("keeps markdown, yaml, json and xml quiet unless invoked explicitly", () => {
    expect(complete("markdown", "li|").candidates).toEqual([]);
    expect(complete("yaml", "li|").candidates).toEqual([]);
    expect(labels(complete("markdown", "li|", { explicit: true }).candidates)).toContain("link");
  });

  it("keeps CSS snippets out of property values", () => {
    expect(labels(complete("css", ".a {\n  fl|").candidates)).toContain("flex");
    expect(labels(complete("css", ".a {\n  display: fl|").candidates)).not.toContain("flex");
  });

  it("does not show html snippets while typing attributes", () => {
    expect(labels(complete("html", "<div cla|").candidates)).not.toContain("div");
  });

  it("matches SQL keyword case to what is typed", () => {
    expect(labels(complete("sql", "sel|").candidates)).toContain("select");
    expect(labels(complete("sql", "SEL|").candidates)).toContain("SELECT");
  });

  it("returns nothing for plain text and unknown languages", () => {
    expect(complete("plaintext", "hello wor|").candidates).toEqual([]);
    expect(complete("brainfuck", "+++|").candidates).toEqual([]);
  });

  it("stays fast on large documents", () => {
    const big = Array.from({ length: 20000 }, (_, i) => `value_${i} = compute(${i})`).join("\n") + "\nval|";
    const start = performance.now();
    const res = complete("python", big);
    expect(performance.now() - start).toBeLessThan(1500);
    expect(res.candidates.length).toBeGreaterThan(0);
  });
});

describe("receiverBefore", () => {
  it("extracts dotted chains and scope operators", () => {
    expect(receiverBefore("x = os.path.")).toEqual({ chain: "os.path", number: false });
    expect(receiverBefore("std::")).toEqual({ chain: "std", number: false });
    expect(receiverBefore("ptr->")).toEqual({ chain: "ptr", number: false });
    expect(receiverBefore("foo().")).toEqual({ chain: null, number: false });
    expect(receiverBefore("x = 3.")).toEqual({ chain: null, number: true });
    expect(receiverBefore("x = ")).toBeNull();
  });
});

describe("legacy getLanguageSnippets API", () => {
  it("still exposes the snippet labels used by earlier tests", () => {
    expect(getLanguageSnippets("c").map((s) => s.label)).toEqual(expect.arrayContaining(["main", "printf", "scanf", "for"]));
    expect(getLanguageSnippets("cpp").map((s) => s.label)).toEqual(expect.arrayContaining(["cout", "cin"]));
    expect(getLanguageSnippets("python").map((s) => s.label)).toEqual(expect.arrayContaining(["input", "def"]));
    expect(getLanguageSnippets("java").map((s) => s.label)).toEqual(expect.arrayContaining(["sout", "scanner"]));
    expect(getLanguageSnippets("brainfuck")).toEqual([]);
  });
});
