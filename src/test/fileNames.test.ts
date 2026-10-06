import { describe, it, expect } from "vitest";
import {
  ancestorFolders,
  ensureExtension,
  findPathConflict,
  makeUniquePath,
  planFileRename,
  planFolderRename,
  planNewFile,
  planNewFolder,
  replaceExtension,
  sanitizeImportedPath,
  validateEntryName,
  type NamespaceState,
} from "@/lib/fileNames";

const ns = (names: string[], folders: string[] = []): NamespaceState => ({
  files: names.map((name, i) => ({ id: `f${i}`, name })),
  folders,
});

describe("validateEntryName", () => {
  it("accepts plain and nested names", () => {
    expect(validateEntryName("main.py")).toEqual({ ok: true, value: "main.py" });
    expect(validateEntryName("src/utils/helpers.ts").ok).toBe(true);
    expect(validateEntryName(".gitignore").ok).toBe(true);
    expect(validateEntryName("my notes.txt").ok).toBe(true);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(validateEntryName("").ok).toBe(false);
    expect(validateEntryName("   ").ok).toBe(false);
  });

  it("rejects leading and trailing spaces", () => {
    expect(validateEntryName(" main.py").ok).toBe(false);
    expect(validateEntryName("main.py ").ok).toBe(false);
    expect(validateEntryName("src /a.py").ok).toBe(false);
  });

  it("rejects slashes at either end and empty folder names", () => {
    expect(validateEntryName("/main.py").ok).toBe(false);
    expect(validateEntryName("src/").ok).toBe(false);
    expect(validateEntryName("a//b.py").ok).toBe(false);
  });

  it("rejects dot segments, trailing dots and reserved characters", () => {
    expect(validateEntryName("..").ok).toBe(false);
    expect(validateEntryName("../secret.py").ok).toBe(false);
    expect(validateEntryName("a/./b.py").ok).toBe(false);
    expect(validateEntryName("file.").ok).toBe(false);
    expect(validateEntryName("a\\b.py").ok).toBe(false);
    expect(validateEntryName("a:b.py").ok).toBe(false);
    expect(validateEntryName("a*.py").ok).toBe(false);
  });

  it("rejects control characters and over-long names", () => {
    expect(validateEntryName("a\u0000b.py").ok).toBe(false);
    expect(validateEntryName("a\nb.py").ok).toBe(false);
    expect(validateEntryName(`${"a".repeat(253)}.py`).ok).toBe(false);
    expect(validateEntryName(`${"a".repeat(252)}.py`).ok).toBe(true);
  });

  it("explains the problem", () => {
    const result = validateEntryName("");
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error).toMatch(/empty/i);
  });
});

describe("extension helpers", () => {
  it("appends an extension only when the file name has none", () => {
    expect(ensureExtension("main", ".py")).toBe("main.py");
    expect(ensureExtension("src/main", ".c")).toBe("src/main.c");
    expect(ensureExtension("main.js", ".py")).toBe("main.js");
    expect(ensureExtension("a.b/readme", ".md")).toBe("a.b/readme.md");
  });

  it("leaves dotfiles alone", () => {
    expect(ensureExtension(".gitignore", ".py")).toBe(".gitignore");
  });

  it("replaces the extension of the last segment only", () => {
    expect(replaceExtension("main.py", ".js")).toBe("main.js");
    expect(replaceExtension("main", ".js")).toBe("main.js");
    expect(replaceExtension("my.pkg/main", ".js")).toBe("my.pkg/main.js");
    expect(replaceExtension("src/a.test.ts", ".js")).toBe("src/a.test.js");
  });

  it("lists ancestor folders shallowest first", () => {
    expect(ancestorFolders("a/b/c.py")).toEqual(["a", "a/b"]);
    expect(ancestorFolders("c.py")).toEqual([]);
  });
});

describe("findPathConflict", () => {
  it("detects duplicates case-insensitively", () => {
    expect(findPathConflict("MAIN.PY", ns(["main.py"]), { kind: "file" })).toMatch(/already exists/);
  });

  it("detects a file clashing with a folder and vice versa", () => {
    expect(findPathConflict("src", ns(["src/a.py"]), { kind: "file" })).toMatch(/folder/);
    expect(findPathConflict("utils", ns(["utils"]), { kind: "folder" })).toMatch(/already exists/);
  });

  it("rejects creating inside a file", () => {
    expect(findPathConflict("a.py/b.py", ns(["a.py"]), { kind: "file" })).toMatch(/is a file/);
  });

  it("allows renaming a file to a different case of its own name", () => {
    const state = ns(["main.py"]);
    expect(findPathConflict("Main.py", state, { kind: "file", ignoreFileId: "f0" })).toBeNull();
  });

  it("returns null for free paths", () => {
    expect(findPathConflict("new.py", ns(["main.py"]), { kind: "file" })).toBeNull();
  });
});

describe("planNewFile", () => {
  it("appends the default language extension and detects the language", () => {
    const plan = planNewFile("main", "", "python", ns([]));
    expect(plan).toMatchObject({ ok: true, path: "main.py", languageId: "python" });
  });

  it("derives the language from an explicit extension", () => {
    const plan = planNewFile("app.ts", "", "python", ns([]));
    expect(plan).toMatchObject({ ok: true, path: "app.ts", languageId: "typescript" });
  });

  it("falls back to plain text for unknown extensions", () => {
    const plan = planNewFile("notes.weird", "", "python", ns([]));
    expect(plan).toMatchObject({ ok: true, path: "notes.weird", languageId: "plaintext" });
  });

  it("resolves the parent folder and reports folders to register", () => {
    const plan = planNewFile("deep/app", "src", "javascript", ns([]));
    expect(plan).toMatchObject({ ok: true, path: "src/deep/app.js", parentFolders: ["src", "src/deep"] });
  });

  it("rejects duplicates, including case-only differences", () => {
    expect(planNewFile("main", "", "python", ns(["Main.py"])).ok).toBe(false);
  });

  it("rejects invalid names", () => {
    expect(planNewFile("../x", "", "python", ns([])).ok).toBe(false);
    expect(planNewFile("", "", "python", ns([])).ok).toBe(false);
  });
});

describe("planNewFolder", () => {
  it("creates nested folders and rejects duplicates", () => {
    expect(planNewFolder("lib", "src", ns([]))).toMatchObject({ ok: true, path: "src/lib", parentFolders: ["src"] });
    expect(planNewFolder("SRC", "", ns([], ["src"])).ok).toBe(false);
  });

  it("rejects a folder named like an existing file", () => {
    expect(planNewFolder("main.py", "", ns(["main.py"])).ok).toBe(false);
  });
});

describe("renaming", () => {
  it("renames a file and reports whether anything changed", () => {
    const state = ns(["src/a.py", "src/b.py"]);
    expect(planFileRename("f0", "c.py", state)).toEqual({ ok: true, path: "src/c.py", changed: true });
    expect(planFileRename("f0", "a.py", state)).toEqual({ ok: true, path: "src/a.py", changed: false });
  });

  it("rejects renaming onto an existing file", () => {
    expect(planFileRename("f0", "B.py", ns(["src/a.py", "src/b.py"])).ok).toBe(false);
  });

  it("rejects slashes in rename input", () => {
    expect(planFileRename("f0", "x/y.py", ns(["a.py"])).ok).toBe(false);
  });

  it("renames a folder without conflicting with its own contents", () => {
    const state = ns(["src/a.py"], ["src"]);
    expect(planFolderRename("src", "SRC", state)).toEqual({ ok: true, path: "SRC", changed: true });
    expect(planFolderRename("src", "lib", ns(["src/a.py", "lib/b.py"], ["src"])).ok).toBe(false);
  });
});

describe("makeUniquePath and sanitizeImportedPath", () => {
  it("adds a numeric suffix before the extension", () => {
    expect(makeUniquePath("main.py", ns([]))).toBe("main.py");
    expect(makeUniquePath("main.py", ns(["main.py"]))).toBe("main-1.py");
    expect(makeUniquePath("main.py", ns(["main.py", "main-1.py"]))).toBe("main-2.py");
    expect(makeUniquePath("src/x", ns(["src/x"]))).toBe("src/x-1");
  });

  it("cleans untrusted paths", () => {
    expect(sanitizeImportedPath("../../etc/passwd")).toBe("etc/passwd");
    expect(sanitizeImportedPath("C:\\proj\\main.py")).toBe("C/proj/main.py");
    expect(sanitizeImportedPath("/abs/file.js")).toBe("abs/file.js");
    expect(sanitizeImportedPath("  ")).toBeNull();
    expect(sanitizeImportedPath("..")).toBeNull();
  });
});
