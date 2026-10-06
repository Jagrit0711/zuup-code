import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "@/lib/github/client";
import { SyncController, type SyncEvent, type SyncControllerOptions } from "@/lib/github/controller";
import { createLink, type GitHubLink } from "@/lib/github/link";
import type { LocalFile } from "@/lib/github/paths";
import { FakeGitHub } from "@/lib/github/testing/fakeGitHub";
import { detectMassDelete, hashFiles } from "@/lib/github/sync";

const toFiles = (m: Record<string, string>): LocalFile[] => Object.entries(m).map(([path, content]) => ({ path, content }));
const toMap = (files: LocalFile[]) => Object.fromEntries(files.map((f) => [f.path, f.content]));

interface Harness {
  fake: FakeGitHub;
  controller: SyncController;
  events: SyncEvent[];
  persisted: GitHubLink[];
  win: EventTarget;
  doc: EventTarget;
  env: { visible: boolean; online: boolean };
  /** The token the client sends (what the app's saved sign-in would be). */
  token: { value: string };
  edit: (files: Record<string, string>) => void;
  advance: (ms: number) => Promise<void>;
  ofType: <T extends SyncEvent["type"]>(type: T) => Array<Extract<SyncEvent, { type: T }>>;
  status: () => string;
}

function setup(
  options: {
    remote?: Record<string, string>;
    local?: Record<string, string>;
    /** Base snapshot = the files both sides agreed on. Defaults to `remote` (clean link). */
    base?: Record<string, string>;
    link?: Partial<GitHubLink>;
    controller?: Partial<SyncControllerOptions>;
    start?: boolean;
    clientRetries?: number;
  } = {},
): Harness {
  const remote = options.remote ?? { "a.py": "A", "b.py": "B" };
  const local = options.local ?? remote;
  const base = options.base ?? remote;
  const fake = new FakeGitHub(remote);
  const token = { value: fake.token };
  const client = new GitHubClient({
    getToken: () => token.value,
    fetch: fake.fetch,
    writeSpacingMs: 0,
    sleep: async () => undefined,
    random: () => 0,
    maxRetries: options.clientRetries ?? 0,
  });
  const link = createLink({
    projectKey: "p1",
    owner: "octo",
    repo: "demo",
    branch: "main",
    baseTree: hashFiles(toFiles(base)),
    ...options.link,
  });
  const win = new EventTarget();
  const doc = new EventTarget();
  const env = { visible: true, online: true };
  const events: SyncEvent[] = [];
  const persisted: GitHubLink[] = [];
  const controller = new SyncController({
    link,
    client,
    files: toFiles(local),
    windowTarget: win,
    documentTarget: doc,
    isVisible: () => env.visible,
    isOnline: () => env.online,
    persistLink: (l) => persisted.push(l),
    random: () => 0,
    ...options.controller,
  });
  controller.on((e) => events.push(e));
  const harness: Harness = {
    fake,
    controller,
    events,
    persisted,
    win,
    doc,
    env,
    token,
    edit: (files) => controller.setFiles(toFiles(files)),
    advance: async (ms) => {
      await vi.advanceTimersByTimeAsync(ms);
      await controller.idle();
    },
    ofType: (type) => events.filter((e) => e.type === type) as never,
    status: () => controller.getState().status,
  };
  if (options.start !== false) controller.start();
  return harness;
}

let current: Harness | null = null;
const make = (...args: Parameters<typeof setup>) => (current = setup(...args));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
});

afterEach(() => {
  current?.controller.dispose();
  current = null;
  vi.useRealTimers();
});

describe("initial sync", () => {
  it("settles to synced without committing anything when both sides agree", async () => {
    const h = make();
    await h.advance(0);
    expect(h.status()).toBe("synced");
    expect(h.fake.commitCount()).toBe(1);
    expect(h.fake.count("POST", /./)).toBe(0);
    expect(h.controller.getState().lastSyncAt).not.toBeNull();
  });

  it("starts idle before start() and does no I/O", () => {
    const h = make({ start: false });
    expect(h.status()).toBe("idle");
    expect(h.fake.calls).toHaveLength(0);
  });

  it("pushes offline edits made before the first sync, pulls remote-only files", async () => {
    const h = make({
      remote: { "a.py": "A", "r.py": "R" },
      local: { "a.py": "A-edited" },
      base: { "a.py": "A" },
    });
    // r.py exists remotely but is not in the base, so it is a remote-added file.
    await h.advance(0);
    expect(h.fake.files()["a.py"]).toBe("A-edited");
    expect(toMap(h.controller.getFiles())).toEqual({ "a.py": "A-edited", "r.py": "R" });
    expect(h.status()).toBe("synced");
  });

  it("reports add/add conflicts when linking a non-empty project to a non-empty repo", async () => {
    const h = make({ remote: { "a.py": "remote version", "same.py": "S" }, local: { "a.py": "my version", "same.py": "S" }, base: {} });
    await h.advance(0);
    expect(h.status()).toBe("conflict");
    const [conflict] = h.controller.getState().conflicts;
    expect(conflict).toMatchObject({ path: "a.py", kind: "add-add", local: "my version", remote: "remote version", base: null });
    expect(h.ofType("conflict")).toHaveLength(1);
    expect(h.fake.files()["a.py"]).toBe("remote version");
    expect(toMap(h.controller.getFiles())["a.py"]).toBe("my version");
  });
});

describe("debounced auto-push", () => {
  it("pushes once after the idle window with the default message", async () => {
    const h = make();
    await h.advance(0);
    h.edit({ "a.py": "A2", "b.py": "B" });
    expect(h.status()).toBe("pending");
    expect(h.controller.getState().pendingPaths).toEqual(["a.py"]);

    await h.advance(2499);
    expect(h.fake.commitCount()).toBe(1);
    await h.advance(1);
    expect(h.fake.commitCount()).toBe(2);
    expect(h.fake.files()).toEqual({ "a.py": "A2", "b.py": "B" });
    expect(h.fake.commits.get(h.fake.head())?.message).toBe("Update a.py via Zuup Code");
    expect(h.status()).toBe("synced");
    const pushed = h.ofType("pushed");
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ paths: ["a.py"], commitSha: h.fake.head() });
  });

  it("uses the plural message for several files", async () => {
    const h = make({ remote: { "a.py": "A", "b.py": "B", "c.py": "C" } });
    await h.advance(0);
    h.edit({ "a.py": "1", "b.py": "2", "c.py": "C" });
    await h.advance(2500);
    expect(h.fake.commits.get(h.fake.head())?.message).toBe("Update 2 files via Zuup Code");
  });

  it("coalesces a burst of edits into a single commit", async () => {
    const h = make();
    await h.advance(0);
    for (let i = 1; i <= 6; i++) {
      h.edit({ "a.py": `A${i}`, "b.py": "B" });
      await h.advance(1000);
    }
    expect(h.fake.commitCount()).toBe(1); // still debouncing
    await h.advance(1500);
    expect(h.fake.commitCount()).toBe(2);
    expect(h.fake.files()["a.py"]).toBe("A6");
  });

  it("never waits longer than the max-wait window under continuous typing", async () => {
    const h = make();
    await h.advance(0);
    for (let t = 0; t < 20_000; t += 2000) {
      h.edit({ "a.py": `A@${t}`, "b.py": "B" });
      if (t < 18_000) await h.advance(2000);
    }
    await h.advance(1990); // t = 19.99 s
    expect(h.fake.commitCount()).toBe(1);
    await h.advance(20);
    expect(h.fake.commitCount()).toBe(2);
    expect(h.fake.files()["a.py"]).toBe("A@18000");
  });

  it("keeps at most one commit in flight and sends edits made meanwhile in the next one", async () => {
    const h = make();
    await h.advance(0);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inFlight = 0;
    let maxInFlight = 0;
    h.fake.onRequest = async (req) => {
      if (req.method === "POST" && /git\/commits/.test(req.path)) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gate;
        inFlight--;
      }
    };
    h.edit({ "a.py": "first", "b.py": "B" });
    await vi.advanceTimersByTimeAsync(2500);
    expect(h.status()).toBe("pushing");

    h.edit({ "a.py": "second", "b.py": "B" });
    await vi.advanceTimersByTimeAsync(3000); // second debounce fires while the first commit is blocked
    expect(maxInFlight).toBe(1);
    expect(h.fake.commitCount()).toBe(1);

    release();
    await h.advance(0);
    expect(h.fake.commitCount()).toBe(3);
    expect(h.fake.files()["a.py"]).toBe("second");
    expect(maxInFlight).toBe(1);
    expect(h.status()).toBe("synced");
  });

  it("pushes deletions and additions in one commit", async () => {
    const h = make();
    await h.advance(0);
    h.edit({ "a.py": "A", "new.py": "N" }); // b.py deleted
    await h.advance(2500);
    expect(h.fake.files()).toEqual({ "a.py": "A", "new.py": "N" });
    expect(h.fake.commitCount()).toBe(2);
  });

  it("does nothing when an edit is reverted before the debounce fires", async () => {
    const h = make();
    await h.advance(0);
    h.edit({ "a.py": "changed", "b.py": "B" });
    h.edit({ "a.py": "A", "b.py": "B" });
    await h.advance(2500);
    expect(h.fake.commitCount()).toBe(1);
    expect(h.status()).toBe("synced");
  });

  it("does not auto-push when autoPush is off, but pushNow() does", async () => {
    const h = make({ link: { autoPush: false } });
    await h.advance(0);
    h.edit({ "a.py": "manual", "b.py": "B" });
    await h.advance(60_000);
    expect(h.fake.commitCount()).toBe(1);
    expect(h.status()).toBe("pending");
    const summary = await h.controller.pushNow();
    expect(summary).toMatchObject({ ok: true, pushed: ["a.py"] });
    expect(h.fake.files()["a.py"]).toBe("manual");
    expect(h.status()).toBe("synced");
  });

  it("honours a custom commit message template", async () => {
    const h = make({ link: { commitMessageTemplate: "zuup: {count} changed ({paths})" } });
    await h.advance(0);
    h.edit({ "a.py": "x", "b.py": "y" });
    await h.advance(2500);
    expect(h.fake.commits.get(h.fake.head())?.message).toBe("zuup: 2 changed (a.py, b.py)");
  });

  it("persists the new base snapshot after a push", async () => {
    const h = make();
    await h.advance(0);
    h.persisted.length = 0;
    h.edit({ "a.py": "persisted", "b.py": "B" });
    await h.advance(2500);
    const last = h.persisted.at(-1)!;
    expect(last.lastSyncedCommitSha).toBe(h.fake.head());
    expect(last.baseTree).toEqual(hashFiles(toFiles({ "a.py": "persisted", "b.py": "B" })));
  });

  it("maps files into the configured sub-folder", async () => {
    const h = make({ remote: { "README.md": "root", "app/main.py": "M" }, local: { "main.py": "M" }, base: { "main.py": "M" }, link: { subdir: "app" } });
    // base keys are local-space already
    await h.advance(0);
    h.edit({ "main.py": "M2", "lib/x.py": "X" });
    await h.advance(2500);
    expect(h.fake.files()).toEqual({ "README.md": "root", "app/main.py": "M2", "app/lib/x.py": "X" });
  });
});

describe("real-time pull", () => {
  it("applies remote changes found by the 20 s poll and reports changed paths", async () => {
    const h = make();
    await h.advance(0);
    h.fake.commitFiles({ "a.py": "A-remote", "c.py": "C-new", "b.py": null });
    await h.advance(19_999);
    expect(h.ofType("remote-applied")).toHaveLength(0);
    await h.advance(1);
    const [applied] = h.ofType("remote-applied");
    expect(applied.changes).toEqual([
      { path: "a.py", kind: "modified" },
      { path: "b.py", kind: "deleted" },
      { path: "c.py", kind: "added" },
    ].sort((x, y) => (x.path < y.path ? -1 : 1)));
    expect(toMap(applied.files)).toEqual({ "a.py": "A-remote", "c.py": "C-new" });
    expect(toMap(h.controller.getFiles())).toEqual({ "a.py": "A-remote", "c.py": "C-new" });
    expect(applied.commitSha).toBe(h.fake.head());
    expect(h.status()).toBe("synced");
    // Applying remote changes must not echo back as a push.
    expect(h.fake.commitCount()).toBe(2);
  });

  it("an unchanged branch costs only conditional ref requests (ETag 304)", async () => {
    const h = make();
    await h.advance(0);
    const commits = h.fake.count("GET", /git\/commits/);
    const trees = h.fake.count("GET", /git\/trees/);
    const refs = h.fake.count("GET", /git\/ref\//);
    await h.advance(60_000);
    expect(h.fake.count("GET", /git\/ref\//)).toBe(refs + 3);
    expect(h.fake.count("GET", /git\/commits/)).toBe(commits);
    expect(h.fake.count("GET", /git\/trees/)).toBe(trees);
    expect(h.fake.notModified).toBe(3);
  });

  it("does not poll while the tab is hidden and catches up when it becomes visible", async () => {
    const h = make();
    await h.advance(0);
    h.env.visible = false;
    h.fake.commitFiles({ "a.py": "while hidden" });
    const before = h.fake.calls.length;
    await h.advance(120_000);
    expect(h.fake.calls.length).toBe(before);
    expect(h.ofType("remote-applied")).toHaveLength(0);

    h.env.visible = true;
    h.doc.dispatchEvent(new Event("visibilitychange"));
    await h.advance(0);
    expect(h.ofType("remote-applied")).toHaveLength(1);
    expect(toMap(h.controller.getFiles())["a.py"]).toBe("while hidden");
  });

  it("checks immediately when the window regains focus", async () => {
    const h = make();
    await h.advance(0);
    await h.advance(5000);
    h.fake.commitFiles({ "a.py": "focus me" });
    h.win.dispatchEvent(new Event("focus"));
    await h.advance(0);
    expect(toMap(h.controller.getFiles())["a.py"]).toBe("focus me");
  });

  it("throttles bursts of focus events", async () => {
    const h = make();
    await h.advance(5000);
    const refs = h.fake.count("GET", /git\/ref\//);
    for (let i = 0; i < 5; i++) h.win.dispatchEvent(new Event("focus"));
    await h.advance(0);
    expect(h.fake.count("GET", /git\/ref\//)).toBe(refs + 1);
  });

  it("with autoPull off, remote changes are reported but never applied", async () => {
    const h = make({ link: { autoPull: false } });
    await h.advance(0);
    h.fake.commitFiles({ "a.py": "remote" });
    await h.advance(20_000);
    expect(h.ofType("remote-applied")).toHaveLength(0);
    expect(toMap(h.controller.getFiles())["a.py"]).toBe("A");
    expect(h.controller.getState().remoteAheadPaths).toEqual(["a.py"]);
    const summary = await h.controller.pullNow();
    expect(summary.applied).toEqual([{ path: "a.py", kind: "modified" }]);
    expect(h.controller.getState().remoteAheadPaths).toEqual([]);
  });

  it("skips binary / undecodable remote files instead of looping or corrupting them", async () => {
    const h = make();
    await h.advance(0);
    h.fake.commitBinary("notes.txt", [0xff, 0xfe, 0x41]);
    h.fake.commitFiles({ "ok.py": "fine" });
    await h.advance(20_000);
    expect(toMap(h.controller.getFiles())).toEqual({ "a.py": "A", "b.py": "B", "ok.py": "fine" });
    expect(h.controller.getState().skipped).toEqual([{ path: "notes.txt", reason: "remote-unsyncable" }]);
    const blobCalls = h.fake.count("GET", /git\/blobs/);
    await h.advance(40_000);
    expect(h.fake.count("GET", /git\/blobs/)).toBe(blobCalls);
    expect(h.status()).toBe("synced");
  });
});

describe("conflicts", () => {
  const conflictSetup = async () => {
    const h = make({ link: { autoPush: true } });
    await h.advance(0);
    h.edit({ "a.py": "mine", "b.py": "B" });
    h.fake.commitFiles({ "a.py": "theirs", "b.py": "B-theirs" });
    await h.advance(2500); // debounce fires: pull b.py, conflict on a.py
    return h;
  };

  it("never overwrites an unsaved local edit: surfaces a conflict and still merges the rest", async () => {
    const h = await conflictSetup();
    expect(h.status()).toBe("conflict");
    expect(toMap(h.controller.getFiles())).toEqual({ "a.py": "mine", "b.py": "B-theirs" });
    const [event] = h.ofType("conflict");
    expect(event.conflicts[0]).toMatchObject({ path: "a.py", kind: "modify-modify", local: "mine", remote: "theirs", base: "A" });
    expect(h.fake.files()["a.py"]).toBe("theirs"); // remote untouched
    expect(h.ofType("pushed")).toHaveLength(0);
  });

  it("does not re-announce the same conflict on every poll", async () => {
    const h = await conflictSetup();
    await h.advance(60_000);
    expect(h.ofType("conflict")).toHaveLength(1);
    expect(h.status()).toBe("conflict");
  });

  it("resolve 'local' pushes the local version on top of the remote", async () => {
    const h = await conflictSetup();
    expect(h.controller.resolveConflict("a.py", "local")).toBe(true);
    expect(h.status()).toBe("pending");
    await h.advance(2500);
    expect(h.fake.files()["a.py"]).toBe("mine");
    expect(h.fake.files()["b.py"]).toBe("B-theirs");
    expect(h.status()).toBe("synced");
    expect(h.controller.getState().conflicts).toEqual([]);
  });

  it("resolve 'remote' rewrites the local file, emits remote-applied and does not push", async () => {
    const h = await conflictSetup();
    const commits = h.fake.commitCount();
    h.controller.resolveConflict("a.py", "remote");
    expect(toMap(h.controller.getFiles())["a.py"]).toBe("theirs");
    const applied = h.ofType("remote-applied").at(-1)!;
    expect(applied.changes).toEqual([{ path: "a.py", kind: "modified" }]);
    expect(h.status()).toBe("synced");
    await h.advance(30_000);
    expect(h.fake.commitCount()).toBe(commits);
  });

  it("resolve with merged content pushes the merge", async () => {
    const h = await conflictSetup();
    h.controller.resolveConflict("a.py", { content: "merged" });
    await h.advance(2500);
    expect(h.fake.files()["a.py"]).toBe("merged");
    expect(h.status()).toBe("synced");
  });

  it("returns false for unknown conflicts", async () => {
    const h = await conflictSetup();
    expect(h.controller.resolveConflict("nope.py", "local")).toBe(false);
  });

  it("local delete vs remote edit is a conflict that keeps the deletion local until resolved", async () => {
    const h = make();
    await h.advance(0);
    h.edit({ "b.py": "B" }); // delete a.py
    h.fake.commitFiles({ "a.py": "edited remotely" });
    await h.advance(2500);
    expect(h.status()).toBe("conflict");
    expect(h.controller.getState().conflicts[0]).toMatchObject({ kind: "delete-modify", local: null, remote: "edited remotely" });
    expect(h.fake.files()["a.py"]).toBe("edited remotely");
    h.controller.resolveConflict("a.py", "local");
    await h.advance(2500);
    expect(h.fake.files()).toEqual({ "b.py": "B" });
  });
});

describe("independent edits and non-fast-forward recovery", () => {
  it("merges non-overlapping local and remote edits in one cycle", async () => {
    const h = make();
    await h.advance(0);
    h.edit({ "a.py": "local-a", "b.py": "B" });
    h.fake.commitFiles({ "b.py": "remote-b" });
    await h.advance(2500);
    expect(h.fake.files()).toEqual({ "a.py": "local-a", "b.py": "remote-b" });
    expect(toMap(h.controller.getFiles())).toEqual({ "a.py": "local-a", "b.py": "remote-b" });
    expect(h.status()).toBe("synced");
  });

  it("recovers from a non-fast-forward by re-reading the branch and replanning", async () => {
    const h = make();
    await h.advance(0);
    let raced = false;
    h.fake.onRequest = (req) => {
      if (!raced && req.method === "PATCH") {
        raced = true;
        h.fake.commitFiles({ "other.py": "from someone else" });
      }
    };
    h.edit({ "a.py": "mine", "b.py": "B" });
    await h.advance(2500);
    expect(raced).toBe(true);
    expect(h.fake.files()).toEqual({ "a.py": "mine", "b.py": "B", "other.py": "from someone else" });
    expect(toMap(h.controller.getFiles())["other.py"]).toBe("from someone else");
    expect(h.status()).toBe("synced");
    expect(h.ofType("error")).toHaveLength(0);
    expect(h.ofType("pushed")).toHaveLength(1);
  });

  it("turns a race on the same file into a conflict instead of overwriting", async () => {
    const h = make();
    await h.advance(0);
    let raced = false;
    h.fake.onRequest = (req) => {
      if (!raced && req.method === "PATCH") {
        raced = true;
        h.fake.commitFiles({ "a.py": "someone else's a.py" });
      }
    };
    h.edit({ "a.py": "mine", "b.py": "B" });
    await h.advance(2500);
    expect(h.status()).toBe("conflict");
    expect(h.fake.files()["a.py"]).toBe("someone else's a.py");
    expect(toMap(h.controller.getFiles())["a.py"]).toBe("mine");
  });
});

describe("failure handling", () => {
  it("401 stops all traffic and reports unauthenticated until resume() with a valid token", async () => {
    const h = make();
    await h.advance(0);
    h.fake.token = "rotated-on-github"; // the saved token is now rejected
    h.edit({ "a.py": "x", "b.py": "B" });
    await h.advance(2500);
    expect(h.status()).toBe("unauthenticated");
    const [error] = h.ofType("error");
    expect(error.code).toBe("unauthorized");

    const calls = h.fake.calls.length;
    await h.advance(120_000);
    expect(h.fake.calls.length).toBe(calls);

    // Sign in again: the client reads the new token from storage.
    h.token.value = "fresh-token";
    h.fake.token = "fresh-token";
    const summary = await h.controller.resume();
    expect(summary.ok).toBe(true);
    expect(h.fake.files()["a.py"]).toBe("x");
    expect(h.status()).toBe("synced");
  });

  it("backs off on rate limits until the reset time and then recovers", async () => {
    const h = make({ controller: { pollIntervalMs: 5000 } });
    await h.advance(0);
    const resetSeconds = Math.floor(Date.now() / 1000) + 60;
    h.fake.failNext(
      /git\/ref\//,
      () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetSeconds) },
        }),
    );
    await h.advance(5000);
    expect(h.status()).toBe("error");
    expect(h.controller.getState().lastError?.code).toBe("rate_limited");
    expect(h.controller.getState().nextAttemptAt).toBeGreaterThanOrEqual(resetSeconds * 1000);

    const calls = h.fake.calls.length;
    await h.advance(40_000);
    expect(h.fake.calls.length).toBe(calls); // never hammers while limited
    h.edit({ "a.py": "after limit", "b.py": "B" });
    await h.advance(30_000);
    expect(h.fake.files()["a.py"]).toBe("after limit");
    expect(h.status()).toBe("synced");
  });

  it("goes offline on network errors, backs off exponentially, and recovers on the 'online' event", async () => {
    const h = make({ controller: { pollIntervalMs: 10_000 } });
    await h.advance(0);
    h.fake.offline = true;
    await h.advance(10_000);
    expect(h.status()).toBe("offline");
    expect(h.ofType("error").at(-1)?.code).toBe("network");

    const first = h.fake.calls.length;
    await h.advance(15_000); // next retry after 20 s backoff, not 10 s
    expect(h.fake.calls.length).toBe(first);

    h.fake.offline = false;
    h.win.dispatchEvent(new Event("online"));
    await h.advance(0);
    expect(h.status()).toBe("synced");
  });

  it("reflects the browser offline event immediately and keeps edits pending", async () => {
    const h = make();
    await h.advance(0);
    h.env.online = false;
    h.win.dispatchEvent(new Event("offline"));
    expect(h.status()).toBe("offline");
    h.edit({ "a.py": "offline edit", "b.py": "B" });
    await h.advance(30_000);
    expect(h.fake.commitCount()).toBe(1);
    expect(h.status()).toBe("offline");
    h.env.online = true;
    h.win.dispatchEvent(new Event("online"));
    await h.advance(0);
    await h.advance(2500);
    expect(h.fake.files()["a.py"]).toBe("offline edit");
    expect(h.status()).toBe("synced");
  });

  it("a push failure keeps the edits and retries on the next poll", async () => {
    const h = make({ controller: { pollIntervalMs: 10_000 } });
    await h.advance(0);
    h.fake.failNext(/git\/commits/, () => new Response(JSON.stringify({ message: "Server Error" }), { status: 500 }));
    h.edit({ "a.py": "retry me", "b.py": "B" });
    await h.advance(2500);
    expect(h.status()).toBe("error");
    expect(h.fake.files()["a.py"]).toBe("A");
    await h.advance(60_000);
    expect(h.fake.files()["a.py"]).toBe("retry me");
    expect(h.status()).toBe("synced");
  });

  it("reports a missing branch", async () => {
    const h = make({ link: { branch: "gone" } });
    await h.advance(0);
    expect(h.status()).toBe("error");
    expect(h.controller.getState().lastError?.code).toBe("not_found");
  });

  it("refuses projects over the file cap with a clear error and does not push", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 501; i++) many[`f${i}.txt`] = String(i);
    const h = make({ local: many, base: {}, remote: { "a.py": "A" } });
    await h.advance(0);
    expect(h.status()).toBe("error");
    expect(h.controller.getState().lastError).toMatchObject({ code: "too_many_files" });
    expect(h.fake.commitCount()).toBe(1);
  });
});

describe("pause, resume, settings and disposal", () => {
  it("pause stops automatic syncing, resume pushes what was edited meanwhile", async () => {
    const h = make();
    await h.advance(0);
    h.controller.pause();
    expect(h.status()).toBe("paused");
    h.edit({ "a.py": "while paused", "b.py": "B" });
    h.fake.commitFiles({ "b.py": "remote while paused" });
    const calls = h.fake.calls.length;
    await h.advance(120_000);
    expect(h.fake.calls.length).toBe(calls);
    expect(h.status()).toBe("paused");

    await h.controller.resume();
    await h.advance(2500);
    expect(h.fake.files()["a.py"]).toBe("while paused");
    expect(toMap(h.controller.getFiles())["b.py"]).toBe("remote while paused");
    expect(h.status()).toBe("synced");
  });

  it("updateLink toggles automation and persists", async () => {
    const h = make({ link: { autoPush: false } });
    await h.advance(0);
    h.edit({ "a.py": "now auto", "b.py": "B" });
    await h.advance(10_000);
    expect(h.fake.commitCount()).toBe(1);
    h.controller.updateLink({ autoPush: true });
    await h.advance(2500);
    expect(h.fake.files()["a.py"]).toBe("now auto");
    expect(h.persisted.some((l) => l.autoPush)).toBe(true);
  });

  it("syncNow pulls and pushes in one go", async () => {
    const h = make({ link: { autoPush: false, autoPull: false } });
    await h.advance(0);
    h.edit({ "a.py": "local", "b.py": "B" });
    h.fake.commitFiles({ "b.py": "remote" });
    const summary = await h.controller.syncNow();
    expect(summary.pushed).toEqual(["a.py"]);
    expect(summary.applied).toEqual([{ path: "b.py", kind: "modified" }]);
    expect(h.fake.files()).toEqual({ "a.py": "local", "b.py": "remote" });
  });

  it("dispose cancels timers and listeners; nothing runs afterwards", async () => {
    const h = make();
    await h.advance(0);
    h.edit({ "a.py": "never pushed", "b.py": "B" });
    h.controller.dispose();
    const calls = h.fake.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    h.win.dispatchEvent(new Event("focus"));
    h.win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.fake.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => h.edit({ "a.py": "ignored" })).not.toThrow();
  });

  it("dispose during an in-flight cycle does not emit or throw", async () => {
    const h = make();
    await h.advance(0);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.fake.onRequest = async (req) => {
      if (req.method === "POST" && /git\/blobs/.test(req.path)) await gate;
    };
    h.edit({ "a.py": "x", "b.py": "B" });
    await vi.advanceTimersByTimeAsync(2500);
    const count = h.events.length;
    h.controller.dispose();
    release();
    await h.controller.idle();
    expect(h.events.length).toBe(count);
  });

  it("notifies subscribe() listeners on state changes (useSyncExternalStore contract)", async () => {
    const h = make({ start: false });
    const listener = vi.fn();
    const off = h.controller.subscribe(listener);
    h.controller.start();
    await h.advance(0);
    expect(listener).toHaveBeenCalled();
    const snapshot = h.controller.getState();
    expect(h.controller.getState()).toBe(snapshot); // stable between changes
    off();
  });
});

describe("mass-delete guard", () => {
  const seven = { "a.py": "A", "b.py": "B", "c.py": "C", "d.py": "D", "e.py": "E", "f.py": "F", "g.py": "G" };

  it("detectMassDelete flags many deletions or deleting everything, nothing else", () => {
    const base = hashFiles(toFiles(seven));
    const del = (paths: string[]) => paths.map((path) => ({ path, kind: "delete" as const }));
    expect(detectMassDelete(del(["a.py", "b.py", "c.py", "d.py"]), base)).toBeNull(); // 4 < 5
    expect(detectMassDelete(del(["a.py", "b.py", "c.py", "d.py", "e.py"]), base)?.paths).toHaveLength(5);
    expect(detectMassDelete(del(["a.py"]), hashFiles(toFiles({ "a.py": "A" })))).toEqual({ paths: ["a.py"], baseCount: 1 });
    expect(detectMassDelete(del(["x.py"]), base)).toBeNull(); // not in the base
    expect(detectMassDelete([{ path: "a.py", kind: "modify" }], base)).toBeNull();
    expect(detectMassDelete(del(["a.py"]), {})).toBeNull();
  });

  it("holds instead of pushing when a reload left only one of many files", async () => {
    const h = make({ remote: seven, local: { "new.py": "N" } });
    await h.advance(0);
    expect(h.status()).toBe("held");
    expect(h.controller.getState().heldDeletes).toEqual({ paths: Object.keys(seven), baseCount: 7 });
    expect(h.ofType("deletes-held")).toHaveLength(1);
    expect(h.fake.commitCount()).toBe(1);
    // Further edits and polls keep holding, without repeating the event.
    h.edit({ "new.py": "N2" });
    await h.advance(30_000);
    expect(h.status()).toBe("held");
    expect(h.ofType("deletes-held")).toHaveLength(1);
    expect(h.fake.files()).toEqual(seven);
  });

  it("holds when every synced file would be deleted, even a small project", async () => {
    const h = make({ remote: { "main.py": "x" }, local: {} });
    await h.advance(0);
    expect(h.status()).toBe("held");
    expect(h.fake.files()).toEqual({ "main.py": "x" });
  });

  it("pushes ordinary deletions without asking", async () => {
    const h = make({ remote: seven });
    await h.advance(0);
    const { "a.py": _a, "b.py": _b, ...rest } = seven;
    h.edit(rest);
    await h.advance(3000);
    expect(h.status()).toBe("synced");
    expect(Object.keys(h.fake.files())).toHaveLength(5);
  });

  it("confirmDeletes() pushes the held deletion", async () => {
    const h = make({ remote: seven, local: { "new.py": "N" } });
    await h.advance(0);
    const summary = await h.controller.confirmDeletes();
    expect(summary.ok).toBe(true);
    expect(h.fake.files()).toEqual({ "new.py": "N" });
    expect(h.status()).toBe("synced");
    expect(h.controller.getState().heldDeletes).toBeNull();
  });

  it("restoreDeleted() brings the files back and keeps local additions", async () => {
    const h = make({ remote: seven, local: { "new.py": "N" } });
    await h.advance(0);
    const summary = await h.controller.restoreDeleted();
    expect(summary.ok).toBe(true);
    expect(summary.applied).toHaveLength(7);
    expect(toMap(h.controller.getFiles())).toEqual({ ...seven, "new.py": "N" });
    const applied = h.ofType("remote-applied").at(-1)!;
    expect(applied.changes.every((c) => c.kind === "added")).toBe(true);
    await h.advance(3000);
    expect(h.fake.files()).toEqual({ ...seven, "new.py": "N" });
    expect(h.status()).toBe("synced");
  });

  it("releases the hold on its own when the files come back", async () => {
    const h = make({ remote: seven, local: {} });
    await h.advance(0);
    expect(h.status()).toBe("held");
    h.edit(seven);
    await h.advance(3000);
    expect(h.status()).toBe("synced");
    expect(h.fake.commitCount()).toBe(1);
  });
});

describe("live file source (getFiles)", () => {
  it("plans against edits that have not reached setFiles, so a pull cannot overwrite them", async () => {
    let live = toFiles({ "a.py": "A", "b.py": "B" });
    const h = make({ controller: { getFiles: () => live } });
    await h.advance(0);
    h.fake.commitFiles({ "a.py": "theirs", "b.py": "B2" });
    live = toFiles({ "a.py": "mine", "b.py": "B" }); // typed, setFiles not called yet
    await h.controller.pullNow();
    expect(h.controller.getState().conflicts.map((c) => c.path)).toEqual(["a.py"]);
    const applied = h.ofType("remote-applied").at(-1)!;
    expect(applied.changes).toEqual([{ path: "b.py", kind: "modified" }]);
    expect(toMap(applied.files)).toEqual({ "a.py": "mine", "b.py": "B2" });
  });
});
