import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_STORAGE_KEY,
  buildLoginUrl,
  canWriteRepo,
  clearAuth,
  completeOAuthRedirect,
  detectOAuthConfigured,
  getAuth,
  inferTokenKind,
  parseOAuthFragment,
  setAuth,
  signInWithToken,
  subscribeAuth,
  validateToken,
} from "@/lib/github/auth";
import { GitHubAuthError, GitHubNetworkError } from "@/lib/github/errors";
import { LINKS_STORAGE_KEY, SCRATCH_PROJECT_KEY, createLink, getLink, listLinks, moveLink, removeLink, saveLink } from "@/lib/github/link";

const userResponse = (scopes = "repo, read:user") =>
  new Response(JSON.stringify({ login: "octo", name: "Octo", avatar_url: "https://a/octo" }), {
    status: 200,
    headers: { "Content-Type": "application/json", "x-oauth-scopes": scopes },
  });

beforeEach(() => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LINKS_STORAGE_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("token storage", () => {
  it("stores and reads auth under the documented key", () => {
    setAuth({ token: "ghp_abc", scopes: ["repo"], login: "octo", avatar: null, savedAt: 5 });
    expect(JSON.parse(localStorage.getItem("zuup_github_auth_v1") as string)).toMatchObject({ token: "ghp_abc", scopes: ["repo"], login: "octo", savedAt: 5 });
    expect(getAuth()).toMatchObject({ token: "ghp_abc", kind: "classic" });
    clearAuth();
    expect(getAuth()).toBeNull();
  });

  it("returns null for corrupt or incomplete storage", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "{not json");
    expect(getAuth()).toBeNull();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ login: "x" }));
    expect(getAuth()).toBeNull();
  });

  it("survives a throwing storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    // jsdom's localStorage shim may not be a Storage instance; either way it must not throw.
    expect(() => getAuth()).not.toThrow();
    spy.mockRestore();
  });

  it("notifies subscribers on sign-in and sign-out", () => {
    const seen: Array<string | null> = [];
    const off = subscribeAuth((a) => seen.push(a?.token ?? null));
    setAuth({ token: "t1", scopes: [], login: null, avatar: null });
    clearAuth();
    off();
    setAuth({ token: "t2", scopes: [], login: null, avatar: null });
    expect(seen).toEqual(["t1", null]);
  });

  it("infers token kinds and write ability", () => {
    expect(inferTokenKind("github_pat_abc")).toBe("fine-grained");
    expect(inferTokenKind("ghp_abc")).toBe("classic");
    expect(inferTokenKind("gho_abc", true)).toBe("oauth");
    expect(canWriteRepo({ scopes: ["repo"], kind: "classic" }, true)).toBe(true);
    expect(canWriteRepo({ scopes: ["public_repo"], kind: "oauth" }, true)).toBe(false);
    expect(canWriteRepo({ scopes: ["public_repo"], kind: "oauth" }, false)).toBe(true);
    expect(canWriteRepo({ scopes: [], kind: "fine-grained" }, true)).toBe(true);
    expect(canWriteRepo({ scopes: [], kind: "classic" }, false)).toBe(false);
  });
});

describe("validateToken / signInWithToken", () => {
  it("reads login and scopes from GET /user", async () => {
    const fetchMock = vi.fn(async () => userResponse());
    const viewer = await validateToken("  ghp_abc ", fetchMock as unknown as typeof fetch);
    expect(viewer).toEqual({ login: "octo", name: "Octo", avatarUrl: "https://a/octo", scopes: ["repo", "read:user"] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/user");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_abc");
  });

  it("rejects bad tokens as GitHubAuthError and network failures as GitHubNetworkError", async () => {
    await expect(validateToken("x", (async () => new Response("{}", { status: 401 })) as typeof fetch)).rejects.toBeInstanceOf(GitHubAuthError);
    await expect(
      validateToken("x", (async () => {
        throw new TypeError("offline");
      }) as typeof fetch),
    ).rejects.toBeInstanceOf(GitHubNetworkError);
    await expect(validateToken("   ")).rejects.toBeInstanceOf(GitHubAuthError);
  });

  it("stores a PAT only after it validates", async () => {
    await expect(signInWithToken("bad", (async () => new Response("{}", { status: 401 })) as typeof fetch)).rejects.toBeInstanceOf(GitHubAuthError);
    expect(getAuth()).toBeNull();
    const auth = await signInWithToken("github_pat_x", (async () => userResponse("")) as typeof fetch);
    expect(auth).toMatchObject({ login: "octo", kind: "fine-grained", scopes: [] });
    expect(getAuth()?.token).toBe("github_pat_x");
  });
});

describe("OAuth hand-off", () => {
  it("builds the same-origin login URL", () => {
    expect(buildLoginUrl({ scope: "repo", returnTo: "/editor?p=1" })).toBe("/api/github/login?scope=repo&return=%2Feditor%3Fp%3D1");
    expect(buildLoginUrl({ returnTo: "/editor" })).toContain("scope=public_repo");
  });

  it("parses token and error fragments, ignores unrelated ones", () => {
    expect(parseOAuthFragment("#gh_token=gho_1&gh_scope=public_repo%2Cread%3Auser")).toEqual({
      type: "token",
      token: "gho_1",
      scopes: ["public_repo", "read:user"],
    });
    expect(parseOAuthFragment("gh_error=access_denied")).toEqual({ type: "error", error: "access_denied" });
    expect(parseOAuthFragment("#section-2")).toBeNull();
    expect(parseOAuthFragment("")).toBeNull();
    expect(parseOAuthFragment("#gh_scope=repo")).toBeNull();
  });

  it("completes the redirect: validates, stores and scrubs the URL", async () => {
    window.history.replaceState(null, "", "/editor?x=1#gh_token=gho_secret&gh_scope=repo");
    const result = await completeOAuthRedirect((async () => userResponse("repo")) as typeof fetch);
    expect(result).toMatchObject({ type: "signed-in", auth: { token: "gho_secret", kind: "oauth", login: "octo" } });
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/editor?x=1");
    expect(getAuth()?.token).toBe("gho_secret");
  });

  it("reports OAuth errors with a friendly message and still scrubs the URL", async () => {
    window.history.replaceState(null, "", "/editor#gh_error=state_mismatch");
    const result = await completeOAuthRedirect();
    expect(result).toMatchObject({ type: "error", error: "state_mismatch" });
    expect(window.location.hash).toBe("");
    expect(getAuth()).toBeNull();
  });

  it("returns null when the URL has no OAuth result", async () => {
    window.history.replaceState(null, "", "/editor#top");
    expect(await completeOAuthRedirect()).toBeNull();
    expect(window.location.hash).toBe("#top");
  });

  it("does not store a token GitHub rejects", async () => {
    window.history.replaceState(null, "", "/editor#gh_token=revoked&gh_scope=repo");
    const result = await completeOAuthRedirect((async () => new Response("{}", { status: 401 })) as typeof fetch);
    expect(result).toMatchObject({ type: "error" });
    expect(getAuth()).toBeNull();
  });

  it("feature-detects OAuth and treats every failure as unconfigured", async () => {
    const ok = (async () => new Response(JSON.stringify({ oauthConfigured: true }), { status: 200 })) as typeof fetch;
    expect(await detectOAuthConfigured(ok)).toBe(true);
    expect(await detectOAuthConfigured((async () => new Response(JSON.stringify({ oauthConfigured: false }))) as typeof fetch)).toBe(false);
    expect(await detectOAuthConfigured((async () => new Response("nope", { status: 404 })) as typeof fetch)).toBe(false);
    expect(await detectOAuthConfigured((async () => new Response("<html>spa fallback</html>", { status: 200 })) as typeof fetch)).toBe(false);
    expect(
      await detectOAuthConfigured((async () => {
        throw new TypeError("offline");
      }) as typeof fetch),
    ).toBe(false);
  });
});

describe("link storage", () => {
  it("round-trips links keyed by project", () => {
    const link = createLink({ projectKey: "p1", owner: "octo", repo: "demo", branch: "main", baseTree: { "a.py": "sha" } });
    expect(saveLink(link)).toBe(true);
    expect(JSON.parse(localStorage.getItem("zuup_github_links_v1") as string).p1.repo).toBe("demo");
    expect(getLink("p1")).toEqual(link);
    expect(listLinks()).toHaveLength(1);
    removeLink("p1");
    expect(getLink("p1")).toBeNull();
  });

  it("applies defaults and drops malformed entries", () => {
    localStorage.setItem(
      LINKS_STORAGE_KEY,
      JSON.stringify({
        good: { projectKey: "good", owner: "o", repo: "r", branch: "b" },
        bad: { projectKey: "bad", owner: "o" },
        worse: 5,
      }),
    );
    const links = listLinks();
    expect(links.map((l) => l.projectKey)).toEqual(["good"]);
    expect(links[0]).toMatchObject({ autoPush: true, autoPull: true, subdir: "", baseTree: {}, lastSyncedCommitSha: null });
    localStorage.setItem(LINKS_STORAGE_KEY, "garbage");
    expect(listLinks()).toEqual([]);
  });

  it("moves the scratch link to a saved project without overwriting", () => {
    saveLink(createLink({ projectKey: SCRATCH_PROJECT_KEY, owner: "o", repo: "r", branch: "main", baseTree: { a: "1" } }));
    const moved = moveLink(SCRATCH_PROJECT_KEY, "proj-9");
    expect(moved).toMatchObject({ projectKey: "proj-9", baseTree: { a: "1" } });
    expect(getLink(SCRATCH_PROJECT_KEY)).toBeNull();
    expect(getLink("proj-9")).not.toBeNull();

    saveLink(createLink({ projectKey: SCRATCH_PROJECT_KEY, owner: "o", repo: "other", branch: "main" }));
    expect(moveLink(SCRATCH_PROJECT_KEY, "proj-9")).toBeNull();
    expect(getLink("proj-9")?.repo).toBe("r");
    expect(moveLink("missing", "x")).toBeNull();
  });
});
