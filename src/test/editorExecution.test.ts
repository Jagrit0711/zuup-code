import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeCode } from "@/lib/pistonApi";
import { getLanguageById, languages, detectNeedsStdin } from "@/lib/languages";
import { getLanguageSnippets } from "@/lib/monacoSnippets";

describe("Language Configuration & Resolution", () => {
  it("should correctly resolve C language with .c extension and gcc/piston runtime", () => {
    const cLang = getLanguageById("c");
    expect(cLang).toBeDefined();
    expect(cLang.id).toBe("c");
    expect(cLang.label).toBe("C");
    expect(cLang.extension).toBe(".c");
    expect(cLang.monacoId).toBe("c");
    expect(cLang.pistonLang).toBe("c");
  });

  it("should have distinct configurations for C++, Java, and Python", () => {
    const cpp = getLanguageById("cpp");
    const java = getLanguageById("java");
    const python = getLanguageById("python");

    expect(cpp.extension).toBe(".cpp");
    expect(cpp.monacoId).toBe("cpp");

    expect(java.extension).toBe(".java");
    expect(java.monacoId).toBe("java");

    expect(python.extension).toBe(".py");
    expect(python.monacoId).toBe("python");
  });
});

describe("IntelliSense & Autocomplete Snippets", () => {
  it("should provide rich snippets for C including scanf and printf", () => {
    const cSnippets = getLanguageSnippets("c");
    expect(cSnippets.length).toBeGreaterThan(5);

    const labels = cSnippets.map((s) => s.label);
    expect(labels).toContain("main");
    expect(labels).toContain("printf");
    expect(labels).toContain("scanf");
    expect(labels).toContain("for");
  });

  it("should provide rich snippets for C++, Python, and Java", () => {
    const cppSnippets = getLanguageSnippets("cpp");
    expect(cppSnippets.some((s) => s.label === "cout")).toBe(true);
    expect(cppSnippets.some((s) => s.label === "cin")).toBe(true);

    const pySnippets = getLanguageSnippets("python");
    expect(pySnippets.some((s) => s.label === "input")).toBe(true);
    expect(pySnippets.some((s) => s.label === "def")).toBe(true);

    const javaSnippets = getLanguageSnippets("java");
    expect(javaSnippets.some((s) => s.label === "sout")).toBe(true);
    expect(javaSnippets.some((s) => s.label === "scanner")).toBe(true);
  });
});

describe("Piston Code Execution with Stdin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should send stdin payload to /api/execute when provided", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, options: RequestInit) => {
        capturedBody = JSON.parse(String(options.body));
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              run: {
                stdout: `Input received: ${capturedBody.stdin}`,
                stderr: "",
                code: 0,
              },
            }),
        });
      })
    );

    const code = `#include <stdio.h>\nint main() { int x; scanf("%d", &x); printf("Input: %d\\n", x); return 0; }`;
    const stdin = "42\n";

    const result = await executeCode("c", "10.2.0", code, stdin);

    expect(capturedBody).toBeDefined();
    expect(capturedBody.language).toBe("c");
    expect(capturedBody.stdin).toBe("42\n");
    expect(result.success).toBe(true);
    expect(result.output[0]).toContain("Input received: 42");
    expect(result.outcome).toBe("success");
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("Interactive Stdin Detection (scanf, input(), cin)", () => {
  it("should detect scanf in C and cin in C++", () => {
    expect(detectNeedsStdin("int x; scanf(\"%d\", &x);", "c")).toBe(true);
    expect(detectNeedsStdin("std::cin >> x;", "cpp")).toBe(true);
    expect(detectNeedsStdin("cin >> val;", "c++")).toBe(true);
  });

  it("should detect input() in Python and Scanner in Java", () => {
    expect(detectNeedsStdin("name = input('Enter name: ')", "python")).toBe(true);
    expect(detectNeedsStdin("Scanner sc = new Scanner(System.in);", "java")).toBe(true);
  });

  it("should ignore commented-out input calls", () => {
    expect(detectNeedsStdin("// scanf(\"%d\", &x);", "c")).toBe(false);
    expect(detectNeedsStdin("/* scanf(\"%d\", &x); */", "c")).toBe(false);
    expect(detectNeedsStdin("# name = input()", "python")).toBe(false);
  });

  it("should return false for code that does not need stdin", () => {
    expect(detectNeedsStdin("printf(\"Hello World!\\n\");", "c")).toBe(false);
    expect(detectNeedsStdin("print('Hello')", "python")).toBe(false);
  });
});

