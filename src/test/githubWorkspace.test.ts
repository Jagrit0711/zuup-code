import { describe, expect, it } from "vitest";
import { createFile } from "@/lib/fileSystem";
import { emptyWorkspace, type WorkspaceState } from "@/lib/workspace";
import {
  ErrorToastGate,
  applyRemoteChanges,
  pickEntryFile,
  repoWebUrl,
  describeSyncError,
  summarizePaths,
  toSyncFiles,
  workspaceFromSyncFiles,
} from "@/lib/githubWorkspace";
import { describeSyncStatus } from "@/components/ide/github/syncStatus";
import type { SyncState } from "@/lib/github";

function workspace(entries: Record<string, string>, open: string[] = []): WorkspaceState {
  const files = Object.entries(entries).map(([name, content]) => createFile(name, "plaintext", content));
  const openTabIds = open.map((n) => files.find((f) => f.name === n)!.id);
  return { files, folders: [], activeFileId: openTabIds[0] ?? "", openTabIds };
}

const byName = (state: WorkspaceState) => Object.fromEntries(state.files.map((f) => [f.name, f.content]));

describe("toSyncFiles", () => {
  it("maps workspace paths and content verbatim", () => {
    const ws = workspace({ "src/main.py": "print(1)\r\n", "README.md": "" });
    expect(toSyncFiles(ws.files)).toEqual([
      { path: "src/main.py", content: "print(1)\r\n" },
      { path: "README.md", content: "" },
    ]);
  });
});

describe("applyRemoteChanges", () => {
  it("modifies in place, keeping ids and tabs", () => {
    const ws = workspace({ "a.py": "A", "b.py": "B" }, ["a.py"]);
    const aId = ws.files[0].id;
    const { state, modified } = applyRemoteChanges(ws, [{ path: "a.py", content: "A2" }, { path: "b.py", content: "B" }], [
      { path: "a.py", kind: "modified" },
    ]);
    expect(modified).toEqual(["a.py"]);
    expect(state.files.find((f) => f.id === aId)?.content).toBe("A2");
    expect(state.openTabIds).toEqual([aId]);
    expect(state.activeFileId).toBe(aId);
  });

  it("adds files with folders and language, without opening tabs", () => {
    const ws = workspace({ "a.py": "A" }, ["a.py"]);
    const { state, added } = applyRemoteChanges(ws, [{ path: "a.py", content: "A" }, { path: "lib/util.ts", content: "x" }], [
      { path: "lib/util.ts", kind: "added" },
    ]);
    expect(added).toEqual(["lib/util.ts"]);
    const util = state.files.find((f) => f.name === "lib/util.ts")!;
    expect(util.content).toBe("x");
    expect(util.languageId).toBe("typescript");
    expect(state.folders).toContain("lib");
    expect(state.openTabIds).toEqual([ws.files[0].id]);
  });

  it("deletes files and closes their tabs", () => {
    const ws = workspace({ "a.py": "A", "b.py": "B" }, ["a.py", "b.py"]);
    const { state, deleted } = applyRemoteChanges(ws, [{ path: "b.py", content: "B" }], [{ path: "a.py", kind: "deleted" }]);
    expect(deleted).toEqual(["a.py"]);
    expect(byName(state)).toEqual({ "b.py": "B" });
    expect(state.openTabIds).toEqual([ws.files[1].id]);
    expect(state.activeFileId).toBe(ws.files[1].id);
  });

  it("treats an added path that already exists as a modification", () => {
    const ws = workspace({ "a.py": "mine" });
    const { state } = applyRemoteChanges(ws, [{ path: "a.py", content: "theirs" }], [{ path: "a.py", kind: "added" }]);
    expect(state.files).toHaveLength(1);
    expect(byName(state)).toEqual({ "a.py": "theirs" });
  });

  it("marks touched files dirty only when asked", () => {
    const ws = workspace({ "a.py": "A" });
    const files = [{ path: "a.py", content: "A2" }, { path: "n.py", content: "N" }];
    const changes = [
      { path: "a.py", kind: "modified" as const },
      { path: "n.py", kind: "added" as const },
    ];
    expect(applyRemoteChanges(ws, files, changes).state.files.every((f) => !f.isDirty)).toBe(true);
    expect(applyRemoteChanges(ws, files, changes, { markDirty: true }).state.files.every((f) => f.isDirty)).toBe(true);
  });

  it("leaves untouched files alone and ignores deletions of unknown paths", () => {
    const ws = workspace({ "a.py": "A", "keep.bin": "\u0001" });
    const { state } = applyRemoteChanges(ws, [], [{ path: "ghost.py", kind: "deleted" }]);
    expect(state).toEqual(ws);
  });
});

describe("workspaceFromSyncFiles / pickEntryFile", () => {
  it("builds a workspace with folders and opens the entry file", () => {
    const ws = workspaceFromSyncFiles([
      { path: "README.md", content: "# hi" },
      { path: "src/app.py", content: "" },
      { path: "main.py", content: "print()" },
    ]);
    expect(ws.files.map((f) => f.name)).toEqual(["README.md", "src/app.py", "main.py"]);
    expect(ws.folders).toEqual(["src"]);
    const active = ws.files.find((f) => f.id === ws.activeFileId);
    expect(active?.name).toBe("main.py");
    expect(ws.openTabIds).toEqual([ws.activeFileId]);
  });

  it("handles an empty import", () => {
    expect(workspaceFromSyncFiles([])).toEqual(emptyWorkspace());
  });

  it("prefers main, index, app, then README, then the shallowest file", () => {
    expect(pickEntryFile(["README.md", "index.html"])).toBe("index.html");
    expect(pickEntryFile(["docs/a.md", "README"])).toBe("README");
    expect(pickEntryFile(["z/y/x.py", "b/c.py", "b/a.py"])).toBe("b/a.py");
    expect(pickEntryFile(["src/main.py", "x.txt"])).toBe("x.txt");
    expect(pickEntryFile([])).toBeNull();
  });
});

describe("describeSyncError", () => {
  it("gives actionable wording for errors retrying cannot fix", () => {
    expect(describeSyncError("too_many_files")?.detail).toMatch(/500 files.*sub-folder/);
    expect(describeSyncError("not_found")?.title).toBeTruthy();
    // GitHub's own message (e.g. branch protection) is more useful than a generic one.
    expect(describeSyncError("forbidden")).toBeNull();
    expect(describeSyncError("network")).toBeNull();
    expect(describeSyncError(null)).toBeNull();
  });
});

describe("repoWebUrl", () => {
  it("links the branch and sub-folder, encoding each segment", () => {
    expect(repoWebUrl({ owner: "octo", repo: "demo", branch: "main", subdir: "" })).toBe("https://github.com/octo/demo/tree/main");
    expect(repoWebUrl({ owner: "octo", repo: "demo", branch: "feat/x y", subdir: "web/app" })).toBe(
      "https://github.com/octo/demo/tree/feat/x%20y/web/app"
    );
  });
});

describe("summarizePaths", () => {
  it("lists a few names and counts the rest", () => {
    expect(summarizePaths([])).toBe("");
    expect(summarizePaths(["a"])).toBe("a");
    expect(summarizePaths(["a", "b"])).toBe("a and b");
    expect(summarizePaths(["a", "b", "c"], 3)).toBe("a, b and c");
    expect(summarizePaths(["a", "b", "c", "d"])).toBe("a, b and 2 more");
  });
});

describe("ErrorToastGate", () => {
  it("shows each code once until reset", () => {
    const gate = new ErrorToastGate();
    expect(gate.shouldShow("network")).toBe(true);
    expect(gate.shouldShow("network")).toBe(false);
    expect(gate.shouldShow("forbidden")).toBe(true);
    gate.reset();
    expect(gate.shouldShow("network")).toBe(true);
  });
});

describe("describeSyncStatus", () => {
  const base: SyncState = {
    status: "synced",
    conflicts: [],
    pendingPaths: [],
    remoteAheadPaths: [],
    skipped: [],
    lastSyncAt: null,
    lastSyncedCommitSha: null,
    lastError: null,
    nextAttemptAt: null,
    heldDeletes: null,
  };

  it("covers every status", () => {
    const statuses: SyncState["status"][] = [
      "idle",
      "pending",
      "pushing",
      "pulling",
      "synced",
      "conflict",
      "held",
      "offline",
      "paused",
      "error",
      "unauthenticated",
    ];
    for (const status of statuses) {
      const view = describeSyncStatus({ ...base, status });
      expect(view.label).toBeTruthy();
      expect(view.detail).toBeTruthy();
    }
  });

  it("reports counts, retry times and errors", () => {
    expect(describeSyncStatus({ ...base, status: "pending", pendingPaths: ["a", "b"] }).detail).toContain("2 changes");
    expect(describeSyncStatus({ ...base, status: "offline", nextAttemptAt: 31_000 }, { now: 1000 }).detail).toContain("30s");
    expect(describeSyncStatus({ ...base, status: "error", lastError: { code: "forbidden", message: "No access" } }).detail).toBe(
      "No access"
    );
    expect(describeSyncStatus({ ...base, status: "pushing" }).spinning).toBe(true);
  });

  it("explains held deletions and too many files", () => {
    const held = describeSyncStatus({ ...base, status: "held", heldDeletes: { paths: ["a", "b", "c"], baseCount: 4 } });
    expect(held.label).toBe("Sync on hold");
    expect(held.detail).toContain("delete 3 files (of 4) on GitHub");
    const tooMany = describeSyncStatus({ ...base, status: "error", lastError: { code: "too_many_files", message: "x" } });
    expect(tooMany.label).toBe("Too many files to sync");
    expect(tooMany.detail).toContain("sub-folder");
    expect(describeSyncStatus(null).tone).toBe("muted");
  });
});
