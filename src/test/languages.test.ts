import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectLanguageFromFilename,
  detectNeedsStdin,
  getLanguageById,
  getLanguagesByGroup,
  getRunnableLanguages,
  languages,
} from "@/lib/languages";
import { executeCode } from "@/lib/pistonApi";

describe("language registry", () => {
  it("has unique ids and extensions", () => {
    const ids = languages.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const exts = languages.flatMap((l) => [l.extension, ...(l.aliases ?? [])]);
    expect(new Set(exts).size).toBe(exts.length);
  });

  it("keeps the ids of the original languages", () => {
    for (const id of ["python", "c", "cpp", "java", "javascript", "typescript", "go", "rust", "html", "css", "json", "markdown", "csv", "plaintext"]) {
      expect(languages.some((l) => l.id === id)).toBe(true);
    }
  });

  it("includes every runtime plus highlight-only languages", () => {
    for (const id of ["php", "ruby", "swift", "csharp", "kotlin", "bash", "lua", "perl", "r", "scala", "haskell", "clojure", "dart", "elixir", "nim", "sql", "yaml", "xml"]) {
      expect(languages.some((l) => l.id === id)).toBe(true);
    }
    expect(getLanguageById("bash").monacoId).toBe("shell");
    expect(getLanguageById("csharp").monacoId).toBe("csharp");
    expect(getLanguageById("sql").pistonLang).toBe("");
  });

  it("never carries default code", () => {
    for (const lang of languages) {
      expect(Object.keys(lang)).not.toContain("defaultCode");
    }
  });

  it("falls back to plain text for unknown ids", () => {
    expect(getLanguageById("nope").id).toBe("plaintext");
  });

  it("groups every language exactly once", () => {
    const grouped = getLanguagesByGroup().flatMap((g) => g.languages.map((l) => l.id));
    expect(grouped.sort()).toEqual(languages.map((l) => l.id).sort());
  });
});

describe("detectLanguageFromFilename", () => {
  it("maps extensions and aliases", () => {
    expect(detectLanguageFromFilename("main.py").id).toBe("python");
    expect(detectLanguageFromFilename("src/App.TSX").id).toBe("typescript");
    expect(detectLanguageFromFilename("run.sh").id).toBe("bash");
    expect(detectLanguageFromFilename("config.yml").id).toBe("yaml");
    expect(detectLanguageFromFilename("Main.kt").id).toBe("kotlin");
  });

  it("uses plain text for no extension, dotfiles and unknown extensions", () => {
    expect(detectLanguageFromFilename("Makefile").id).toBe("plaintext");
    expect(detectLanguageFromFilename(".gitignore").id).toBe("plaintext");
    expect(detectLanguageFromFilename("data.unknownext").id).toBe("plaintext");
    expect(detectLanguageFromFilename("my.dir/README").id).toBe("plaintext");
  });
});

describe("runnable languages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("only lists languages with a Piston key", () => {
    const runnable = getRunnableLanguages();
    expect(runnable.length).toBeGreaterThanOrEqual(23);
    expect(runnable.every((l) => l.pistonLang !== "")).toBe(true);
    expect(runnable.some((l) => l.id === "html")).toBe(false);
  });

  it("maps every runnable language to a runtime the execution API accepts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ run: { stdout: "ok", stderr: "", code: 0 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const lang of getRunnableLanguages()) {
      const result = await executeCode(lang.pistonLang, lang.pistonVersion, "x");
      expect(result.success, `${lang.id} should be accepted by pistonApi`).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(getRunnableLanguages().length);
  });
});

describe("detectNeedsStdin for the newer languages", () => {
  it.each([
    ["php", "$line = fgets(STDIN);"],
    ["ruby", "name = gets"],
    ["swift", "let n = readLine()"],
    ["csharp", "var s = Console.ReadLine();"],
    ["kotlin", "val s = readLine()"],
    ["bash", "read name"],
    ["lua", "local n = io.read()"],
    ["perl", "my $l = <STDIN>;"],
    ["r", "x <- readLines('stdin')"],
    ["scala", "val s = scala.io.StdIn.readLine()"],
    ["haskell", "main = getLine >>= putStrLn"],
    ["clojure", "(read-line)"],
    ["dart", "var s = stdin.readLineSync();"],
    ["elixir", "IO.gets(\"name: \")"],
    ["nim", "let s = readLine(stdin)"],
  ])("detects input in %s", (lang, code) => {
    expect(detectNeedsStdin(code, lang)).toBe(true);
  });

  it("ignores programs that only print", () => {
    expect(detectNeedsStdin("echo hello", "bash")).toBe(false);
    expect(detectNeedsStdin("-- readLine()", "lua")).toBe(false);
    expect(detectNeedsStdin("puts 'hi'", "ruby")).toBe(false);
  });
});
