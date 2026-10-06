import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GitHubClient,
  type AppliedChange,
  type LocalFile,
  clearAuth,
  createLink,
  getAuth,
  getLink,
  hashFiles,
  saveLink,
  setAuth,
} from "@/lib/github";
import { FakeGitHub } from "@/lib/github/testing/fakeGitHub";
import { applyRemoteChanges, toSyncFiles, workspaceFromSyncFiles } from "@/lib/githubWorkspace";
import type { WorkspaceState } from "@/lib/workspace";
import { useGitHubSync } from "@/hooks/useGitHubSync";

/**
 * Drives useGitHubSync the way the editor page does (live workspace in a ref, remote changes applied
 * through the pure workspace helpers) against an in-memory GitHub.
 */

const toFiles = (record: Record<string, string>): LocalFile[] => Object.entries(record).map(([path, content]) => ({ path, content }));
const contents = (ws: WorkspaceState) => Object.fromEntries(ws.files.map((f) => [f.name, f.content]));

let fake: FakeGitHub;
let createClient: () => GitHubClient;

const controllerOptions = {
  debounceMs: 10,
  maxWaitMs: 50,
  pollIntervalMs: 60_000,
  windowTarget: null,
  documentTarget: null,
  isVisible: () => true,
  isOnline: () => true,
};

function useEditorHarness(projectKey: string, initial: Record<string, string>) {
  const [ws, setWs] = useState<WorkspaceState>(() => workspaceFromSyncFiles(toFiles(initial)));
  const wsRef = useRef(ws);
  const commit = useCallback((next: WorkspaceState) => {
    wsRef.current = next;
    setWs(next);
  }, []);
  const getFiles = useCallback(() => toSyncFiles(wsRef.current.files), []);
  const onRemoteApplied = useCallback(
    (files: LocalFile[], changes: AppliedChange[]) => commit(applyRemoteChanges(wsRef.current, files, changes).state),
    [commit]
  );
  const onReplaceFiles = useCallback((files: LocalFile[]) => commit(workspaceFromSyncFiles(files)), [commit]);
  const sync = useGitHubSync({
    projectKey,
    enabled: true,
    getFiles,
    filesVersion: ws.files,
    onRemoteApplied,
    onReplaceFiles,
    createClient,
    controllerOptions,
  });
  const edit = (path: string, content: string) =>
    commit({ ...wsRef.current, files: wsRef.current.files.map((f) => (f.name === path ? { ...f, content } : f)) });
  return { ws, sync, edit };
}

function linkProject(projectKey: string, base: Record<string, string>) {
  saveLink(createLink({ projectKey, owner: "octo", repo: "demo", branch: "main", baseTree: hashFiles(toFiles(base)) }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  localStorage.clear();
  fake = new FakeGitHub({ "a.py": "A", "b.py": "B" });
  createClient = () =>
    new GitHubClient({
      getToken: () => getAuth()?.token ?? null,
      fetch: fake.fetch,
      writeSpacingMs: 0,
      sleep: async () => undefined,
      random: () => 0,
      maxRetries: 0,
    });
  setAuth({ token: fake.token, scopes: ["repo"], login: "octo", avatar: null });
});

afterEach(() => {
  clearAuth();
  localStorage.clear();
});

describe("useGitHubSync", () => {
  it("applies pulled changes to the editor and never pushes the old content back", async () => {
    linkProject("p1", { "a.py": "A", "b.py": "B" });
    const { result, unmount } = renderHook(() => useEditorHarness("p1", { "a.py": "A", "b.py": "B" }));
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    const aId = result.current.ws.files.find((f) => f.name === "a.py")!.id;
    const commitsBefore = fake.commitCount();

    fake.commitFiles({ "a.py": "A2", "b.py": null, "lib/c.py": "C" });
    await act(async () => {
      await result.current.sync.controller!.pullNow();
    });

    expect(contents(result.current.ws)).toEqual({ "a.py": "A2", "lib/c.py": "C" });
    expect(result.current.ws.files.find((f) => f.name === "a.py")!.id).toBe(aId);
    expect(result.current.ws.folders).toContain("lib");

    await act(async () => {
      await sleep(80);
      await result.current.sync.controller!.idle();
    });
    expect(fake.commitCount()).toBe(commitsBefore + 1); // only the remote commit above
    expect(result.current.sync.state?.status).toBe("synced");
    unmount();
  });

  it("pushes editor changes", async () => {
    linkProject("p1", { "a.py": "A", "b.py": "B" });
    const { result, unmount } = renderHook(() => useEditorHarness("p1", { "a.py": "A", "b.py": "B" }));
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    act(() => result.current.edit("a.py", "edited"));
    await waitFor(() => expect(fake.files()["a.py"]).toBe("edited"));
    unmount();
  });

  it("imports a repository into the project and links it from a clean base", async () => {
    const { result, unmount } = renderHook(() => useEditorHarness("p1", { "old.txt": "x" }));
    expect(result.current.sync.link).toBeNull();
    await act(async () => {
      await result.current.sync.importIntoProject({ owner: "octo", repo: "demo", branch: "main", subdir: "" });
    });
    expect(contents(result.current.ws)).toEqual({ "a.py": "A", "b.py": "B" });
    expect(Object.keys(getLink("p1")!.baseTree).sort()).toEqual(["a.py", "b.py"]);
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    unmount();
  });

  it("holds the push instead of deleting the repository when the project is empty, then restores", async () => {
    linkProject("p1", { "a.py": "A", "b.py": "B" });
    const { result, unmount } = renderHook(() => useEditorHarness("p1", {}));
    await waitFor(() => expect(result.current.sync.state?.status).toBe("held"));
    expect(result.current.sync.state?.heldDeletes?.paths).toEqual(["a.py", "b.py"]);
    expect(fake.files()).toEqual({ "a.py": "A", "b.py": "B" });
    await act(async () => {
      await result.current.sync.restoreDeleted();
    });
    expect(contents(result.current.ws)).toEqual({ "a.py": "A", "b.py": "B" });
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    expect(fake.files()).toEqual({ "a.py": "A", "b.py": "B" });
    unmount();
  });

  it("catches a pull racing an edit that has not reached setFiles yet", async () => {
    linkProject("p1", { "a.py": "A", "b.py": "B" });
    const { result, unmount } = renderHook(() => useEditorHarness("p1", { "a.py": "A", "b.py": "B" }));
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    fake.commitFiles({ "a.py": "theirs" });
    // Edit and pull in the same tick: the setFiles effect has not run when the cycle plans.
    await act(async () => {
      result.current.edit("a.py", "mine");
      await result.current.sync.controller!.pullNow();
    });
    expect(contents(result.current.ws)["a.py"]).toBe("mine");
    expect(result.current.sync.state?.conflicts.map((c) => c.path)).toEqual(["a.py"]);
    unmount();
  });

  it("moves the scratch link to the saved project", async () => {
    linkProject("scratch", { "a.py": "A", "b.py": "B" });
    const { result, rerender, unmount } = renderHook(({ key }) => useEditorHarness(key, { "a.py": "A", "b.py": "B" }), {
      initialProps: { key: "scratch" },
    });
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    act(() => result.current.sync.rekey("scratch", "p9"));
    rerender({ key: "p9" });
    await waitFor(() => expect(result.current.sync.link?.projectKey).toBe("p9"));
    expect(getLink("scratch")).toBeNull();
    await waitFor(() => expect(result.current.sync.state?.status).toBe("synced"));
    // The retired scratch controller must not recreate its link.
    await sleep(30);
    expect(getLink("scratch")).toBeNull();
    unmount();
  });

  it("unlinks and forgets", async () => {
    linkProject("p1", { "a.py": "A", "b.py": "B" });
    const { result, unmount } = renderHook(() => useEditorHarness("p1", { "a.py": "A", "b.py": "B" }));
    await waitFor(() => expect(result.current.sync.controller).not.toBeNull());
    act(() => result.current.sync.unlink());
    await waitFor(() => expect(result.current.sync.link).toBeNull());
    expect(result.current.sync.controller).toBeNull();
    expect(getLink("p1")).toBeNull();
    unmount();
  });
});
