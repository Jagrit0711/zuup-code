import { describe, it, expect } from "vitest";
import { createFile } from "@/lib/fileSystem";
import {
  WORKSPACE_STORAGE_KEY,
  addFile,
  addFiles,
  appendFiles,
  clearWorkspace,
  closeTab,
  emptyWorkspace,
  foldersOf,
  hasExternalWorkspaceSource,
  hasStoredWorkspace,
  importFiles,
  isWorkspaceEmpty,
  loadWorkspace,
  openFile,
  parseWorkspace,
  removeFile,
  removeFolder,
  renameFolder,
  saveWorkspace,
  serializeWorkspace,
  workspaceSignature,
  type StorageLike,
  type WorkspaceState,
} from "@/lib/workspace";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

function build(...names: string[]): WorkspaceState {
  let state = emptyWorkspace();
  for (const n of names) state = addFile(state, createFile(n, "plaintext", `content of ${n}`));
  return state;
}

describe("workspace transitions", () => {
  it("starts completely blank", () => {
    const ws = emptyWorkspace();
    expect(ws.files).toEqual([]);
    expect(ws.folders).toEqual([]);
    expect(ws.activeFileId).toBe("");
    expect(isWorkspaceEmpty(ws)).toBe(true);
  });

  it("adds a file, opens it and registers parent folders", () => {
    const ws = build("src/app/main.py");
    expect(ws.files).toHaveLength(1);
    expect(ws.activeFileId).toBe(ws.files[0].id);
    expect(ws.openTabIds).toEqual([ws.files[0].id]);
    expect(ws.folders).toEqual(["src", "src/app"]);
  });

  it("does not duplicate folders that already exist", () => {
    const ws = build("src/a.py", "src/b.py");
    expect(ws.folders).toEqual(["src"]);
  });

  it("closing a tab keeps the file and activates the neighbour", () => {
    const ws = build("a.py", "b.py", "c.py");
    const [a, b, c] = ws.files;
    expect(ws.activeFileId).toBe(c.id);
    const closedActive = closeTab(ws, c.id);
    expect(closedActive.files).toHaveLength(3);
    expect(closedActive.activeFileId).toBe(b.id);
    const closedMiddle = closeTab(openFile(ws, b.id), b.id);
    expect(closedMiddle.activeFileId).toBe(c.id);
    const closedInactive = closeTab(ws, a.id);
    expect(closedInactive.activeFileId).toBe(c.id);
  });

  it("closing the last tab leaves no active file but keeps the file", () => {
    const ws = build("a.py");
    const closed = closeTab(ws, ws.files[0].id);
    expect(closed.activeFileId).toBe("");
    expect(closed.openTabIds).toEqual([]);
    expect(closed.files).toHaveLength(1);
    // The file can be reopened from the explorer.
    expect(openFile(closed, ws.files[0].id).activeFileId).toBe(ws.files[0].id);
  });

  it("deleting the last file leaves a valid empty workspace", () => {
    const ws = build("a.py");
    const next = removeFile(ws, ws.files[0].id);
    expect(next.files).toEqual([]);
    expect(next.activeFileId).toBe("");
    expect(next.openTabIds).toEqual([]);
  });

  it("deleting the active file activates a remaining tab", () => {
    const ws = build("a.py", "b.py");
    const next = removeFile(ws, ws.files[1].id);
    expect(next.files.map((f) => f.name)).toEqual(["a.py"]);
    expect(next.activeFileId).toBe(ws.files[0].id);
  });

  it("deleting a folder removes its files, tabs and subfolders", () => {
    const ws = build("keep.py", "src/a.py", "src/deep/b.py");
    const next = removeFolder(ws, "src");
    expect(next.files.map((f) => f.name)).toEqual(["keep.py"]);
    expect(next.folders).toEqual([]);
    expect(next.openTabIds).toEqual([next.files[0].id]);
    expect(next.activeFileId).toBe(next.files[0].id);
  });

  it("does not treat a similarly named folder as a child", () => {
    const ws = build("src2/a.py", "src/b.py");
    const next = removeFolder(ws, "src");
    expect(next.files.map((f) => f.name)).toEqual(["src2/a.py"]);
    expect(next.folders).toEqual(["src2"]);
  });

  it("renaming a folder moves files and nested folders", () => {
    const ws = build("src/a.py", "src/deep/b.py");
    const next = renameFolder(ws, "src", "lib");
    expect(next.files.map((f) => f.name)).toEqual(["lib/a.py", "lib/deep/b.py"]);
    expect(next.folders.sort()).toEqual(["lib", "lib/deep"]);
  });

  it("appendFiles and addFiles differ in whether a tab opens", () => {
    const ws = build("a.py");
    const extra = createFile("out/log.txt", "plaintext", "");
    const appended = appendFiles(ws, [extra]);
    expect(appended.activeFileId).toBe(ws.activeFileId);
    expect(appended.openTabIds).toEqual(ws.openTabIds);
    expect(appended.folders).toContain("out");
    const added = addFiles(ws, [extra]);
    expect(added.activeFileId).toBe(extra.id);
  });
});

describe("importFiles", () => {
  it("sanitizes names, resolves collisions and detects languages", () => {
    const files = importFiles([
      { name: "../evil/main.py", content: "a" },
      { name: "main.py", content: "b" },
      { name: "main.py", content: "c", languageId: "javascript" },
      { name: "README", content: "d" },
      { name: "x.y", content: "e", languageId: "not-a-language" },
    ]);
    expect(files.map((f) => f.name)).toEqual(["evil/main.py", "main.py", "main-1.py", "README", "x.y"]);
    expect(files.map((f) => f.languageId)).toEqual(["python", "python", "javascript", "plaintext", "plaintext"]);
    expect(new Set(files.map((f) => f.id)).size).toBe(files.length);
    expect(files.every((f) => f.isDirty === false)).toBe(true);
  });

  it("avoids names already in the workspace", () => {
    const existing = build("main.py").files;
    const [added] = importFiles([{ name: "MAIN.py", content: "" }], { files: existing, folders: [] });
    expect(added.name).toBe("MAIN-1.py");
  });

  it("derives folders from file paths", () => {
    expect(foldersOf([{ name: "a/b/c.py" }, { name: "a/d.py" }, { name: "e.py" }]).sort()).toEqual(["a", "a/b"]);
  });
});

describe("persistence", () => {
  it("round-trips files, folders, tabs and the project name", () => {
    const ws = build("a.py", "src/b.js");
    const storage = memoryStorage();
    expect(saveWorkspace(ws, "My Project", storage)).toBe(true);
    const loaded = loadWorkspace(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.projectName).toBe("My Project");
    expect(loaded?.files.map((f) => [f.id, f.name, f.content])).toEqual(ws.files.map((f) => [f.id, f.name, f.content]));
    expect(loaded?.folders).toEqual(["src"]);
    expect(loaded?.activeFileId).toBe(ws.activeFileId);
    expect(loaded?.openTabIds).toEqual(ws.openTabIds);
  });

  it("round-trips an empty workspace", () => {
    const storage = memoryStorage();
    saveWorkspace(emptyWorkspace(), null, storage);
    expect(hasStoredWorkspace(storage)).toBe(true);
    const loaded = loadWorkspace(storage);
    expect(loaded?.files).toEqual([]);
    expect(loaded?.activeFileId).toBe("");
  });

  it("does not persist dirty flags", () => {
    const ws = build("a.py");
    ws.files[0].isDirty = true;
    expect(JSON.parse(serializeWorkspace(ws, null)).files[0]).not.toHaveProperty("isDirty");
  });

  it("clears the stored workspace", () => {
    const storage = memoryStorage();
    saveWorkspace(build("a.py"), null, storage);
    clearWorkspace(storage);
    expect(storage.data.has(WORKSPACE_STORAGE_KEY)).toBe(false);
    expect(loadWorkspace(storage)).toBeNull();
  });

  it("survives quota errors", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(saveWorkspace(build("a.py"), null, storage)).toBe(false);
  });

  it("handles missing storage", () => {
    expect(saveWorkspace(build("a.py"), null, null)).toBe(false);
    expect(loadWorkspace(null)).toBeNull();
    expect(hasStoredWorkspace(null)).toBe(false);
  });

  it("rejects corrupt or foreign data", () => {
    expect(parseWorkspace(null)).toBeNull();
    expect(parseWorkspace("not json")).toBeNull();
    expect(parseWorkspace("123")).toBeNull();
    expect(parseWorkspace(JSON.stringify({ version: 99, files: [] }))).toBeNull();
    expect(parseWorkspace(JSON.stringify({ version: 1, files: "nope" }))).toBeNull();
  });

  it("repairs partially invalid snapshots", () => {
    const raw = JSON.stringify({
      version: 1,
      projectName: 42,
      activeFileId: "ghost",
      openTabIds: ["f1", "ghost"],
      folders: ["src", 7, ""],
      files: [
        { id: "f1", name: "a.py", languageId: "python", content: "x" },
        { id: "f1", name: "dup.py", languageId: "python", content: "y" },
        { id: "f2", name: "", languageId: "python", content: "y" },
        { id: "f3", name: "b.txt", languageId: "unknown-lang", content: "z" },
        null,
      ],
    });
    const parsed = parseWorkspace(raw);
    expect(parsed?.files.map((f) => f.id)).toEqual(["f1", "f3"]);
    expect(parsed?.files[1].languageId).toBe("plaintext");
    expect(parsed?.folders).toEqual(["src"]);
    expect(parsed?.openTabIds).toEqual(["f1"]);
    expect(parsed?.activeFileId).toBe("f1");
    expect(parsed?.projectName).toBeNull();
  });

  it("fingerprints saveable content", () => {
    const a = build("a.py").files;
    const b = a.map((f) => ({ ...f, content: f.content + "!" }));
    expect(workspaceSignature(a)).toBe(workspaceSignature(a));
    expect(workspaceSignature(a)).not.toBe(workspaceSignature(b));
  });
});

describe("hasExternalWorkspaceSource", () => {
  const base = { search: "", pathname: "/editor", forkPayload: null };
  it("is false for a plain editor URL", () => {
    expect(hasExternalWorkspaceSource(base)).toBe(false);
    expect(hasExternalWorkspaceSource({ ...base, search: "?new=true" })).toBe(false);
  });
  it("is true for a project, fork payload or share URL", () => {
    expect(hasExternalWorkspaceSource({ ...base, search: "?project=abc" })).toBe(true);
    expect(hasExternalWorkspaceSource({ ...base, forkPayload: "{}" })).toBe(true);
    expect(hasExternalWorkspaceSource({ ...base, pathname: "/s/abc_DEF-1" })).toBe(true);
    expect(hasExternalWorkspaceSource({ ...base, pathname: "/p/xyz" })).toBe(true);
  });
});
