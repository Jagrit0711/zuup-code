import { describe, expect, it } from "vitest";
import { scanContext } from "@/lib/editor/syntax";
import { getLanguageData } from "@/lib/editor/languageData";
import { applyIndent, escapeSnippet, renderSnippet } from "@/lib/editor/snippet";
import { windowAround } from "@/lib/editor/textWindow";
import { collectMemberNames, collectWords, extractDeclarations } from "@/lib/editor/docSymbols";

const ctx = (lang: string, text: string) => scanContext(text, getLanguageData(lang)!.syntax);

describe("scanContext", () => {
  it("detects line comments and returns to code on the next line", () => {
    expect(ctx("python", "x = 1  # note")).toBe("comment");
    expect(ctx("python", "# note\nx")).toBe("code");
    expect(ctx("javascript", "foo(); // hi")).toBe("comment");
  });

  it("detects block comments until they close", () => {
    expect(ctx("c", "int a; /* open")).toBe("comment");
    expect(ctx("c", "/* done */ int")).toBe("code");
  });

  it("detects strings and ignores escaped quotes", () => {
    expect(ctx("python", 'x = "abc')).toBe("string");
    expect(ctx("python", 'x = "a\\"b" + y')).toBe("code");
    expect(ctx("javascript", "const s = 'it\\'s")).toBe("string");
  });

  it("treats an unterminated single-line string as ended at the newline", () => {
    expect(ctx("javascript", "const s = 'oops\nnext")).toBe("code");
  });

  it("handles python triple quoted strings across lines", () => {
    expect(ctx("python", 'def f():\n    """doc\n    more')).toBe("string");
    expect(ctx("python", 'def f():\n    """doc"""\n    x')).toBe("code");
  });

  it("handles template literals across lines", () => {
    expect(ctx("javascript", "const t = `a\nb")).toBe("string");
    expect(ctx("javascript", "const t = `a\nb` + c")).toBe("code");
  });

  it("does not treat comment markers inside strings as comments", () => {
    expect(ctx("c", 'printf("// not a comment"); x')).toBe("code");
    expect(ctx("python", 's = "# no"; y')).toBe("code");
  });

  it("treats rust lifetimes as code and char literals as closed", () => {
    expect(ctx("rust", "fn f<'a>(x: &'a str) -> &'a str { x")).toBe("code");
    expect(ctx("rust", "let c = 'x'; let d")).toBe("code");
    expect(ctx("c", "char c = '\"'; int x")).toBe("code");
  });

  it("supports SQL and Lua style comments", () => {
    expect(ctx("sql", "SELECT 1 -- why")).toBe("comment");
    expect(ctx("lua", "local x --[[ open")).toBe("comment");
  });
});

describe("snippet helpers", () => {
  it("renders placeholders with defaults and finds the final caret", () => {
    const r = renderSnippet("for ${1:i} in range(${2:n}):\n\t$0");
    expect(r.text).toBe("for i in range(n):\n\t");
    expect(r.caret).toBe(r.text.length);
  });

  it("renders nested placeholders and escapes", () => {
    expect(renderSnippet("a ${1:b ${2:c}} \\$x \\} d").text).toBe("a b c $x } d");
  });

  it("falls back to the first tab stop when there is no $0", () => {
    const r = renderSnippet("f(${1:x}, ${2:y})");
    expect(r.text).toBe("f(x, y)");
    expect(r.caret).toBe(2);
  });

  it("round-trips plain text through escapeSnippet", () => {
    const raw = 'cost = "$5" + {a}\\n';
    expect(renderSnippet(escapeSnippet(raw)).text).toBe(raw);
  });

  it("indents lines after the first and expands tabs", () => {
    expect(applyIndent("if x:\n\tpass\n\n\t\tdeep", "  ", "    ")).toBe("if x:\n      pass\n\n          deep");
  });
});

describe("windowAround", () => {
  it("returns small texts untouched", () => {
    expect(windowAround("abc", 2, 100)).toEqual({ text: "abc", offset: 2, truncated: false });
  });

  it("keeps the cursor inside a bounded window", () => {
    const text = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const offset = text.indexOf("line 2500");
    const w = windowAround(text, offset, 2000);
    expect(w.truncated).toBe(true);
    expect(w.text.length).toBeLessThanOrEqual(2000);
    expect(w.text.startsWith("line ") || w.text.startsWith("ine ") === false).toBe(true);
    expect(w.text.slice(w.offset, w.offset + 9)).toBe("line 2500");
  });
});

describe("document symbols", () => {
  const py = getLanguageData("python")!;

  it("finds python functions, classes, variables, imports and parameters", () => {
    const lines = [
      "import os",
      "from math import sqrt as root, pi",
      "import numpy as np",
      "class Dog:",
      "    def bark(self, times, loud=False):",
      "        total = times * 2",
      "for idx, val in items:",
      "# def commented_out():",
    ];
    const names = extractDeclarations(lines, py.decls).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["os", "root", "pi", "np", "Dog", "bark", "times", "loud", "total", "idx", "val"]));
    expect(names).not.toContain("commented_out");
    expect(names).not.toContain("self");
  });

  it("keeps the most specific kind for duplicated names", () => {
    const syms = extractDeclarations(["foo = 1", "def foo():", "    pass"], py.decls);
    expect(syms.find((s) => s.name === "foo")?.kind).toBe("function");
  });

  it("finds C functions and variables but not calls or returns", () => {
    const c = getLanguageData("c")!;
    const lines = ["int add(int a, int b) {", "    int total = a + b;", "    return total;", "    printf(\"x\");", "}"];
    const names = extractDeclarations(lines, c.decls).map((s) => s.name);
    expect(names).toContain("add");
    expect(names).toContain("total");
    expect(names).not.toContain("printf");
    expect(names).not.toContain("return");
  });

  it("finds go, rust and java declarations", () => {
    const go = extractDeclarations(["func (s *Server) Start() error {", "x, y := 1, 2", "type Point struct {"], getLanguageData("go")!.decls).map((s) => s.name);
    expect(go).toEqual(expect.arrayContaining(["Start", "x", "y", "Point"]));
    const rust = extractDeclarations(["pub fn run() {", "let mut count = 0;", "struct User {"], getLanguageData("rust")!.decls).map((s) => s.name);
    expect(rust).toEqual(expect.arrayContaining(["run", "count", "User"]));
    const java = extractDeclarations(["public static int sum(int a, int b) {", "List<String> names = new ArrayList<>();"], getLanguageData("java")!.decls).map((s) => s.name);
    expect(java).toEqual(expect.arrayContaining(["sum", "names"]));
  });

  it("collects words by frequency and skips the word being typed", () => {
    const text = "alpha beta alpha gamma alp";
    const w = collectWords(text, text.lastIndexOf("alp"), text.length);
    expect(w[0]).toBe("alpha");
    expect(w).not.toContain("alp");
  });

  it("collects members used on a receiver", () => {
    const text = "self.name = 1\nself.age = 2\nother.size = 3\nself.";
    expect(collectMemberNames(text, "self")).toEqual(["name", "age"]);
    expect(collectMemberNames(text)).toEqual(expect.arrayContaining(["name", "age", "size"]));
  });
});
