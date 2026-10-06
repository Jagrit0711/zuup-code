import { describe, expect, it } from "vitest";
import { gitBlobSha } from "@/lib/github/sha";
import {
  ShaMemo,
  applyPull,
  applyShaUpdates,
  buildConflicts,
  buildRemoteSnapshot,
  classifyPath,
  computeBaseAfterPull,
  computeBaseAfterPush,
  excludeShas,
  formatCommitMessage,
  hashFiles,
  planPull,
  planPush,
  planSync,
  resolveConflict,
  snapshotAfterPush,
  type RemoteSnapshot,
  type ShaMap,
} from "@/lib/github/sync";
import type { LocalFile } from "@/lib/github/paths";

const sha = gitBlobSha;
const A = sha("A");
const B = sha("B");
const C = sha("C");

const snapshot = (files: Record<string, string>, extra: Partial<RemoteSnapshot> = {}): RemoteSnapshot => ({
  commitSha: "c1",
  treeSha: "t1",
  files: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha(c)])),
  modes: {},
  skipped: [],
  ...extra,
});
const local = (files: Record<string, string>): LocalFile[] => Object.entries(files).map(([path, content]) => ({ path, content }));
const baseOf = (files: Record<string, string>): ShaMap => hashFiles(local(files));

describe("classifyPath: three-way matrix", () => {
  const cases: Array<[string, string | undefined, string | undefined, string | undefined, string]> = [
    ["unchanged", A, A, A, "unchanged"],
    ["absent everywhere", undefined, undefined, undefined, "unchanged"],
    ["local modified", B, A, A, "local-modified"],
    ["local added", B, undefined, undefined, "local-added"],
    ["local deleted", undefined, A, A, "local-deleted"],
    ["remote modified", A, A, B, "remote-modified"],
    ["remote added", undefined, undefined, B, "remote-added"],
    ["remote deleted", A, A, undefined, "remote-deleted"],
    ["both modified identically", B, A, B, "converged"],
    ["both added identically", B, undefined, B, "converged"],
    ["both deleted", undefined, A, undefined, "converged"],
    ["both modified differently", B, A, C, "conflict"],
    ["both added differently", B, undefined, C, "conflict"],
    ["local modified, remote deleted", B, A, undefined, "conflict"],
    ["local deleted, remote modified", undefined, A, B, "conflict"],
  ];
  it.each(cases)("%s", (_name, l, b, r, expected) => {
    expect(classifyPath(l, b, r)).toBe(expected);
  });
});

describe("planSync", () => {
  it("reports an in-sync project", () => {
    const files = { "a.py": "A", "b.py": "B" };
    const plan = planSync({ local: local(files), base: baseOf(files), remote: snapshot(files) });
    expect(plan.inSync).toBe(true);
    expect(plan.entries).toEqual([]);
  });

  it("plans local-only changes as a push", () => {
    const base = baseOf({ "a.py": "A", "gone.py": "G" });
    const plan = planSync({
      local: local({ "a.py": "A2", "new.py": "N" }),
      base,
      remote: snapshot({ "a.py": "A", "gone.py": "G" }),
    });
    expect(plan.push.map((c) => [c.path, c.kind])).toEqual([
      ["a.py", "modify"],
      ["gone.py", "delete"],
      ["new.py", "add"],
    ]);
    expect(plan.push.find((c) => c.path === "gone.py")?.content).toBeNull();
    expect(plan.pull).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.fastForward).toBe(false);
  });

  it("plans a fast-forward pull when nothing changed locally", () => {
    const files = { "a.py": "A" };
    const plan = planSync({
      local: local(files),
      base: baseOf(files),
      remote: snapshot({ "a.py": "A2", "b.py": "B" }),
    });
    expect(plan.fastForward).toBe(true);
    expect(plan.pull.map((c) => [c.path, c.kind])).toEqual([
      ["a.py", "modify"],
      ["b.py", "add"],
    ]);
    expect(plan.push).toEqual([]);
  });

  it("merges independent changes on both sides without conflicts", () => {
    const base = { "a.py": "A", "b.py": "B" };
    const plan = planSync({
      local: local({ "a.py": "A-local", "b.py": "B" }),
      base: baseOf(base),
      remote: snapshot({ "a.py": "A", "b.py": "B-remote" }),
    });
    expect(plan.push.map((c) => c.path)).toEqual(["a.py"]);
    expect(plan.pull.map((c) => c.path)).toEqual(["b.py"]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.fastForward).toBe(false);
  });

  it("surfaces every kind of conflict and never schedules them for push or pull", () => {
    const base = { "mm.py": "A", "md.py": "A", "dm.py": "A" };
    const plan = planSync({
      local: local({ "mm.py": "L", "md.py": "L", "aa.py": "L" }),
      base: baseOf(base),
      remote: snapshot({ "mm.py": "R", "dm.py": "R", "aa.py": "R" }),
    });
    const kinds = Object.fromEntries(plan.conflicts.map((c) => [c.path, c.kind]));
    expect(kinds).toEqual({
      "mm.py": "modify-modify",
      "md.py": "modify-delete",
      "dm.py": "delete-modify",
      "aa.py": "add-add",
    });
    expect(plan.push).toEqual([]);
    expect(plan.pull).toEqual([]);
  });

  it("treats both-sides-identical changes as converged (no push, no pull)", () => {
    const plan = planSync({
      local: local({ "a.py": "same", "new.py": "same-new" }),
      base: baseOf({ "a.py": "A", "old.py": "O" }),
      remote: snapshot({ "a.py": "same", "new.py": "same-new" }),
    });
    expect(plan.converged.map((c) => c.path)).toEqual(["a.py", "new.py", "old.py"]);
    expect(plan.push).toEqual([]);
    expect(plan.pull).toEqual([]);
    expect(plan.inSync).toBe(true);
    const next = computeBaseAfterPull(baseOf({ "a.py": "A", "old.py": "O" }), plan);
    expect(next).toEqual(baseOf({ "a.py": "same", "new.py": "same-new" }));
  });

  it("models a rename as delete plus add", () => {
    const files = { "old.py": "code" };
    const plan = planSync({
      local: local({ "new.py": "code" }),
      base: baseOf(files),
      remote: snapshot(files),
    });
    expect(plan.push.map((c) => [c.path, c.kind])).toEqual([
      ["new.py", "add"],
      ["old.py", "delete"],
    ]);
  });

  it("skips unsyncable local files and never reads them as deletions", () => {
    const big = "x".repeat(1024 * 1024 + 10);
    const baseFiles = { "big.txt": "small before", "a.py": "A" };
    const plan = planSync({
      local: [...local({ "a.py": "A" }), { path: "big.txt", content: big }, { path: "logo.png", content: "x" }],
      base: baseOf(baseFiles),
      remote: snapshot(baseFiles),
    });
    expect(plan.push).toEqual([]);
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual(["binary-extension", "too-large"]);
  });

  it("protects remote-unsyncable paths from being overwritten", () => {
    const plan = planSync({
      local: local({ "data.txt": "my text" }),
      base: {},
      remote: snapshot({}, { skipped: ["data.txt"] }),
    });
    expect(plan.push).toEqual([]);
    expect(plan.skipped).toEqual([{ path: "data.txt", reason: "remote-unsyncable" }]);
  });

  it("an empty base against a populated remote yields add/add conflicts only where content differs", () => {
    const plan = planSync({
      local: local({ "same.py": "S", "diff.py": "L", "only-local.py": "O" }),
      base: {},
      remote: snapshot({ "same.py": "S", "diff.py": "R", "only-remote.py": "X" }),
    });
    expect(plan.conflicts.map((c) => c.path)).toEqual(["diff.py"]);
    expect(plan.converged.map((c) => c.path)).toEqual(["same.py"]);
    expect(plan.push.map((c) => c.path)).toEqual(["only-local.py"]);
    expect(plan.pull.map((c) => c.path)).toEqual(["only-remote.py"]);
  });

  it("is deterministic and independent of input order", () => {
    const files = { "b.py": "B", "a.py": "A", "c/d.py": "D" };
    const remote = snapshot({ "a.py": "A!", "z.py": "Z" });
    const one = planSync({ local: local(files), base: {}, remote });
    const two = planSync({ local: local(files).reverse(), base: {}, remote });
    expect(two).toEqual(one);
  });

  it("planPush and planPull are one-sided views of the same plan", () => {
    const input = {
      local: local({ "a.py": "A-local", "b.py": "B" }),
      base: baseOf({ "a.py": "A", "b.py": "B" }),
      remote: snapshot({ "a.py": "A", "b.py": "B2" }),
    };
    const push = planPush(input);
    expect(push.push.map((c) => c.path)).toEqual(["a.py"]);
    expect(push.pull).toEqual([]);
    const pull = planPull(input);
    expect(pull.push).toEqual([]);
    expect(pull.pull.map((c) => c.path)).toEqual(["b.py"]);
  });

  it("normalises Windows-style local paths before comparing", () => {
    const plan = planSync({
      local: [{ path: "src\\main.py", content: "A" }],
      base: baseOf({ "src/main.py": "A" }),
      remote: snapshot({ "src/main.py": "A" }),
    });
    expect(plan.inSync).toBe(true);
  });
});

describe("applying plans", () => {
  it("applyPull adds, modifies and deletes without touching other files", () => {
    const result = applyPull(
      local({ "keep.py": "K", "edit.py": "old", "drop.py": "D" }),
      [
        { path: "edit.py", sha: "x", kind: "modify" },
        { path: "drop.py", sha: null, kind: "delete" },
        { path: "new.py", sha: "y", kind: "add" },
      ],
      { "edit.py": "new", "new.py": "N" },
    );
    expect(Object.fromEntries(result.files.map((f) => [f.path, f.content]))).toEqual({
      "keep.py": "K",
      "edit.py": "new",
      "new.py": "N",
    });
    expect(result.changes).toEqual([
      { path: "edit.py", kind: "modified" },
      { path: "drop.py", kind: "deleted" },
      { path: "new.py", kind: "added" },
    ]);
  });

  it("applyPull refuses to silently drop a change when content is missing", () => {
    expect(() => applyPull([], [{ path: "a.py", sha: "x", kind: "add" }], {})).toThrowError(/Missing remote content/);
  });

  it("computeBaseAfterPull leaves conflicting paths on their old base", () => {
    const base = baseOf({ "a.py": "A", "c.py": "A" });
    const plan = planSync({
      local: local({ "a.py": "A", "c.py": "L" }),
      base,
      remote: snapshot({ "a.py": "A2", "c.py": "R" }),
    });
    const next = computeBaseAfterPull(base, plan);
    expect(next["a.py"]).toBe(sha("A2"));
    expect(next["c.py"]).toBe(base["c.py"]);
  });

  it("computeBaseAfterPush records pushed shas and removals", () => {
    const next = computeBaseAfterPush(baseOf({ "a.py": "A", "b.py": "B" }), [
      { path: "a.py", content: "A2", sha: sha("A2"), kind: "modify" },
      { path: "b.py", content: null, sha: null, kind: "delete" },
      { path: "n.py", content: "N", sha: sha("N"), kind: "add" },
    ]);
    expect(next).toEqual(baseOf({ "a.py": "A2", "n.py": "N" }));
  });

  it("snapshotAfterPush mirrors what the commit did", () => {
    const next = snapshotAfterPush(
      snapshot({ "a.py": "A", "b.py": "B" }, { modes: { "a.py": "100755" } }),
      [
        { path: "a.py", content: "A2", sha: sha("A2"), kind: "modify" },
        { path: "b.py", content: null, sha: null, kind: "delete" },
      ],
      "c2",
      "t2",
    );
    expect(next.commitSha).toBe("c2");
    expect(next.files).toEqual({ "a.py": sha("A2") });
    expect(next.modes).toEqual({ "a.py": "100755" });
  });

  it("applyShaUpdates does not mutate its input", () => {
    const base = { "a.py": A };
    applyShaUpdates(base, [{ path: "a.py", sha: null }]);
    expect(base).toEqual({ "a.py": A });
  });
});

describe("conflict resolution", () => {
  const files = { "a.py": "base" };
  const base = baseOf(files);
  const makeConflict = (localFiles: Record<string, string>, remoteFiles: Record<string, string>) => {
    const plan = planSync({ local: local(localFiles), base, remote: snapshot(remoteFiles) });
    const remoteContents: Record<string, string> = {};
    for (const [p, c] of Object.entries(remoteFiles)) remoteContents[p] = c;
    return { plan, conflict: buildConflicts(plan.conflicts, local(localFiles), remoteContents, { "a.py": "base" })[0] };
  };

  it("buildConflicts exposes local, remote and base content", () => {
    const { conflict } = makeConflict({ "a.py": "mine" }, { "a.py": "theirs" });
    expect(conflict).toMatchObject({ path: "a.py", kind: "modify-modify", local: "mine", remote: "theirs", base: "base" });
  });

  it("keeping local turns the conflict into an ordinary push", () => {
    const { conflict } = makeConflict({ "a.py": "mine" }, { "a.py": "theirs" });
    const res = resolveConflict(conflict, "local");
    expect(res.fileChange).toBeNull();
    const nextBase = applyShaUpdates(base, [res.baseUpdate]);
    const plan = planSync({ local: local({ "a.py": "mine" }), base: nextBase, remote: snapshot({ "a.py": "theirs" }) });
    expect(plan.conflicts).toEqual([]);
    expect(plan.push.map((c) => [c.path, c.kind])).toEqual([["a.py", "modify"]]);
  });

  it("taking remote rewrites the file and leaves everything in sync", () => {
    const { conflict } = makeConflict({ "a.py": "mine" }, { "a.py": "theirs" });
    const res = resolveConflict(conflict, "remote");
    expect(res.fileChange).toEqual({ path: "a.py", content: "theirs" });
    const nextBase = applyShaUpdates(base, [res.baseUpdate]);
    const plan = planSync({ local: local({ "a.py": "theirs" }), base: nextBase, remote: snapshot({ "a.py": "theirs" }) });
    expect(plan.inSync).toBe(true);
  });

  it("supports merged content supplied by the user", () => {
    const { conflict } = makeConflict({ "a.py": "mine" }, { "a.py": "theirs" });
    const res = resolveConflict(conflict, { content: "merged" });
    expect(res.fileChange).toEqual({ path: "a.py", content: "merged" });
    const nextBase = applyShaUpdates(base, [res.baseUpdate]);
    const plan = planSync({ local: local({ "a.py": "merged" }), base: nextBase, remote: snapshot({ "a.py": "theirs" }) });
    expect(plan.push.map((c) => c.path)).toEqual(["a.py"]);
  });

  it("local-deleted vs remote-modified: keeping local pushes the deletion, taking remote restores the file", () => {
    const plan = planSync({ local: [], base, remote: snapshot({ "a.py": "theirs" }) });
    const [conflict] = buildConflicts(plan.conflicts, [], { "a.py": "theirs" }, {});
    expect(conflict.kind).toBe("delete-modify");
    expect(conflict.local).toBeNull();

    const keep = resolveConflict(conflict, "local");
    const afterKeep = planSync({ local: [], base: applyShaUpdates(base, [keep.baseUpdate]), remote: snapshot({ "a.py": "theirs" }) });
    expect(afterKeep.push.map((c) => [c.path, c.kind])).toEqual([["a.py", "delete"]]);

    const take = resolveConflict(conflict, "remote");
    expect(take.fileChange).toEqual({ path: "a.py", content: "theirs" });
  });

  it("local-modified vs remote-deleted: keeping local re-adds the file, taking remote deletes it", () => {
    const plan = planSync({ local: local({ "a.py": "mine" }), base, remote: snapshot({}) });
    const [conflict] = buildConflicts(plan.conflicts, local({ "a.py": "mine" }), {}, {});
    expect(conflict.kind).toBe("modify-delete");
    expect(conflict.remote).toBeNull();

    const keep = resolveConflict(conflict, "local");
    expect(keep.baseUpdate.sha).toBeNull();
    const afterKeep = planSync({ local: local({ "a.py": "mine" }), base: applyShaUpdates(base, [keep.baseUpdate]), remote: snapshot({}) });
    expect(afterKeep.push.map((c) => [c.path, c.kind])).toEqual([["a.py", "add"]]);

    const take = resolveConflict(conflict, "remote");
    expect(take.fileChange).toEqual({ path: "a.py", content: null });
  });
});

describe("remote snapshots", () => {
  const entry = (path: string, extra: Record<string, unknown> = {}) => ({ path, mode: "100644", type: "blob", sha: sha(path), size: 10, ...extra });

  it("maps the sub-folder, ignores directories and applies ignore rules", () => {
    const snap = buildRemoteSnapshot({
      commitSha: "c",
      treeSha: "t",
      subdir: "app",
      entries: [
        { path: "app", mode: "040000", type: "tree", sha: "x" },
        entry("app/main.py"),
        entry("app/lib/util.py"),
        entry("app/logo.png"),
        entry("app/node_modules/x.js"),
        entry("app/big.txt", { size: 2 * 1024 * 1024 }),
        entry("app/link", { mode: "120000" }),
        entry("app/sub", { mode: "160000", type: "commit" }),
        entry("other/file.py"),
        entry("README.md"),
      ],
    });
    expect(Object.keys(snap.files).sort()).toEqual(["lib/util.py", "main.py"]);
    expect(snap.skipped).toEqual(["big.txt", "link", "sub"]);
  });

  it("keeps executable modes", () => {
    const snap = buildRemoteSnapshot({ commitSha: "c", treeSha: "t", subdir: "", entries: [entry("run.sh", { mode: "100755" })] });
    expect(snap.modes["run.sh"]).toBe("100755");
  });

  it("moves known-binary blobs to skipped", () => {
    const entries = [entry("a.txt"), entry("b.txt")];
    const snap = buildRemoteSnapshot({ commitSha: "c", treeSha: "t", subdir: "", entries, knownUnsyncable: new Set([sha("b.txt")]) });
    expect(Object.keys(snap.files)).toEqual(["a.txt"]);
    expect(snap.skipped).toEqual(["b.txt"]);
    const again = excludeShas(buildRemoteSnapshot({ commitSha: "c", treeSha: "t", subdir: "", entries }), new Set([sha("a.txt")]));
    expect(Object.keys(again.files)).toEqual(["b.txt"]);
    expect(again.skipped).toEqual(["a.txt"]);
  });
});

describe("ShaMemo", () => {
  it("re-hashes only when the content changes", () => {
    const memo = new ShaMemo();
    expect(memo.sha("a", "x")).toBe(sha("x"));
    expect(memo.sha("a", "x")).toBe(sha("x"));
    expect(memo.sha("a", "y")).toBe(sha("y"));
    memo.retain([]);
    expect(memo.sha("a", "y")).toBe(sha("y"));
  });
});

describe("commit messages", () => {
  it("uses the documented defaults", () => {
    expect(formatCommitMessage(undefined, ["main.py"])).toBe("Update main.py via Zuup Code");
    expect(formatCommitMessage("", ["a.py", "b.py", "c.py"])).toBe("Update 3 files via Zuup Code");
  });

  it("supports custom templates", () => {
    expect(formatCommitMessage("sync: {count} -> {paths}", ["a.py", "b.py"])).toBe("sync: 2 -> a.py, b.py");
    expect(formatCommitMessage("{paths}", ["1", "2", "3", "4", "5", "6"])).toBe("1, 2, 3, 4, 5, ...");
  });

  it("never produces an empty message", () => {
    expect(formatCommitMessage("   ", ["a.py"])).toBe("Update a.py via Zuup Code");
  });
});
