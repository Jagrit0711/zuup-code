import { describe, expect, it, vi } from "vitest";
import { GitHubClient, INLINE_CONTENT_THRESHOLD, parseLinkHeader } from "@/lib/github/client";
import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubNetworkError,
  GitHubNotFoundError,
  GitHubPermissionError,
  GitHubRateLimitError,
} from "@/lib/github/errors";
import { importRepo, linkFromImport } from "@/lib/github/importRepo";
import { gitBlobSha } from "@/lib/github/sha";
import { FakeGitHub } from "@/lib/github/testing/fakeGitHub";

const makeClient = (fake: FakeGitHub, extra: Partial<ConstructorParameters<typeof GitHubClient>[0]> = {}) => {
  const sleeps: number[] = [];
  const client = new GitHubClient({
    getToken: () => fake.token,
    fetch: fake.fetch,
    writeSpacingMs: 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    ...extra,
  });
  return { client, sleeps };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("GitHubClient transport", () => {
  it("sends bearer auth, JSON accept and the pinned API version", async () => {
    const seen: Headers[] = [];
    const client = new GitHubClient({
      getToken: () => "tok",
      fetch: async (_url, init) => {
        seen.push(new Headers(init?.headers));
        return json({ login: "octo", id: 1, html_url: "u" });
      },
    });
    await client.getViewer();
    expect(seen[0].get("authorization")).toBe("Bearer tok");
    expect(seen[0].get("accept")).toBe("application/vnd.github+json");
    expect(seen[0].get("x-github-api-version")).toBe("2022-11-28");
  });

  it("throws GitHubAuthError without any network call when there is no token", async () => {
    const fetchSpy = vi.fn();
    const client = new GitHubClient({ getToken: () => null, fetch: fetchSpy as unknown as typeof fetch });
    await expect(client.getViewer()).rejects.toBeInstanceOf(GitHubAuthError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps HTTP failures to typed errors", async () => {
    const respond = (status: number, message: string, headers: Record<string, string> = {}) =>
      new GitHubClient({
        getToken: () => "t",
        maxRetries: 0,
        fetch: async () => json({ message }, status, headers),
      });

    await expect(respond(401, "Bad credentials").getViewer()).rejects.toBeInstanceOf(GitHubAuthError);
    await expect(respond(403, "Bad credentials").getViewer()).rejects.toBeInstanceOf(GitHubAuthError);
    await expect(respond(403, "Resource not accessible by personal access token").getViewer()).rejects.toBeInstanceOf(GitHubPermissionError);
    await expect(respond(404, "Not Found").getViewer()).rejects.toBeInstanceOf(GitHubNotFoundError);
    const conflict = await respond(409, "Git Repository is empty.").getViewer().catch((e) => e);
    expect(conflict).toBeInstanceOf(GitHubConflictError);
    expect(conflict.code).toBe("empty_repository");
    const nff = await respond(422, "Update is not a fast forward").getViewer().catch((e) => e);
    expect(nff).toBeInstanceOf(GitHubConflictError);
    expect(nff.isNonFastForward).toBe(true);
  });

  it("reports primary rate limits with the reset time", async () => {
    const reset = 1_900_000_000;
    const client = new GitHubClient({
      getToken: () => "t",
      maxRetries: 0,
      fetch: async () => json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }),
    });
    const err = await client.getViewer().catch((e) => e);
    expect(err).toBeInstanceOf(GitHubRateLimitError);
    expect(err.resetAt).toBe(reset * 1000);
    expect(err.retryAtMs(0)).toBe(reset * 1000);
  });

  it("honours Retry-After for short secondary limits (sleeps, then succeeds)", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = new GitHubClient({
      getToken: () => "t",
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0,
      now: () => 0,
      fetch: async () => {
        calls++;
        return calls === 1
          ? json({ message: "You have exceeded a secondary rate limit" }, 403, { "retry-after": "5" })
          : json({ login: "octo", id: 1, html_url: "u" });
      },
    });
    await expect(client.getViewer()).resolves.toMatchObject({ login: "octo" });
    expect(calls).toBe(2);
    expect(sleeps).toEqual([5000]);
  });

  it("surfaces long rate-limit waits instead of sleeping on them", async () => {
    const sleep = vi.fn(async () => undefined);
    const client = new GitHubClient({
      getToken: () => "t",
      sleep,
      now: () => 0,
      fetch: async () => json({ message: "rate limited" }, 429, { "retry-after": "3600" }),
    });
    const err = await client.getViewer().catch((e) => e);
    expect(err).toBeInstanceOf(GitHubRateLimitError);
    expect(err.retryAfter).toBe(3600);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries 5xx on GET with exponential backoff and jitter, then gives up", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = new GitHubClient({
      getToken: () => "t",
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0.5,
      maxRetries: 2,
      fetch: async () => {
        calls++;
        return json({ message: "Bad gateway" }, 502);
      },
    });
    await expect(client.getViewer()).rejects.toMatchObject({ status: 502 });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([625, 1250]); // 500*2^n * (1 + 0.5*0.5)
  });

  it("converts fetch failures to GitHubNetworkError", async () => {
    const fake = new FakeGitHub({ "a.txt": "a" });
    fake.offline = true;
    const { client } = makeClient(fake, { maxRetries: 1 });
    await expect(client.getViewer()).rejects.toBeInstanceOf(GitHubNetworkError);
  });

  it("refuses to send the token to a foreign host via a Link header", async () => {
    const client = new GitHubClient({
      getToken: () => "t",
      fetch: async () => json([{ name: "main", commit: { sha: "1" } }], 200, { link: '<https://evil.example/branches?page=2>; rel="next"' }),
    });
    await expect(client.listBranches("o", "r")).rejects.toMatchObject({ code: "invalid_url" });
  });
});

describe("ETag conditional requests", () => {
  it("returns notModified on 304 and keeps the cached payload", async () => {
    const fake = new FakeGitHub({ "a.txt": "a" });
    const { client } = makeClient(fake);
    const first = await client.getBranchRef("octo", "demo", "main");
    expect(first).toMatchObject({ sha: fake.head(), notModified: false });
    const second = await client.getBranchRef("octo", "demo", "main");
    expect(second).toMatchObject({ sha: fake.head(), notModified: true });
    const third = await client.getBranchRef("octo", "demo", "main", { etag: "bogus" });
    expect(third.notModified).toBe(false);
    fake.commitFiles({ "a.txt": "b" });
    const fourth = await client.getBranchRef("octo", "demo", "main");
    expect(fourth).toMatchObject({ sha: fake.head(), notModified: false });
  });

  it("clears cached ETags when the token changes (different account)", async () => {
    const fake = new FakeGitHub({ "a.txt": "a" });
    let token = fake.token;
    const client = new GitHubClient({ getToken: () => token, fetch: fake.fetch });
    await client.getBranchRef("octo", "demo", "main");
    fake.token = "other";
    token = "other";
    const again = await client.getBranchRef("octo", "demo", "main");
    expect(again.notModified).toBe(false);
  });
});

describe("pagination and listing", () => {
  it("parses Link headers", () => {
    expect(parseLinkHeader('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"')).toEqual({
      next: "https://api.github.com/x?page=2",
    });
    expect(parseLinkHeader(null)).toEqual({});
  });

  it("follows next links and respects maxPages", async () => {
    const urls: string[] = [];
    const client = new GitHubClient({
      getToken: () => "t",
      fetch: async (input) => {
        const url = String(input);
        urls.push(url);
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        return json([{ name: `b${page}`, commit: { sha: `s${page}` }, protected: false }], 200, {
          link: `<https://api.github.com/repos/o/r/branches?per_page=100&page=${page + 1}>; rel="next"`,
        });
      },
    });
    const branches = await client.paginate<{ name: string }, string>("/repos/o/r/branches", { maxPages: 3, map: (b) => b.name });
    expect(branches).toEqual(["b1", "b2", "b3"]);
    expect(urls).toHaveLength(3);
  });

  it("listRepos filters by query and reports whether more pages exist", async () => {
    const repo = (name: string) => ({ id: 1, name, full_name: `octo/${name}`, owner: { login: "octo" }, private: false, html_url: "u", permissions: { push: true } });
    const client = new GitHubClient({
      getToken: () => "t",
      fetch: async (input) => {
        expect(String(input)).toContain("/user/repos?");
        return json([repo("alpha"), repo("beta")], 200, { link: '<https://api.github.com/user/repos?page=2>; rel="next"' });
      },
    });
    const result = await client.listRepos({ query: "alp" });
    expect(result.repos.map((r) => r.fullName)).toEqual(["octo/alpha"]);
    expect(result.repos[0]).toMatchObject({ owner: "octo", canPush: true, defaultBranch: "main" });
    expect(result.hasNextPage).toBe(true);
  });

  it("searchRepos scopes the query to the viewer", async () => {
    const urls: string[] = [];
    const client = new GitHubClient({
      getToken: () => "t",
      fetch: async (input) => {
        urls.push(String(input));
        return String(input).endsWith("/user") ? json({ login: "octo", id: 1, html_url: "u" }) : json({ items: [] });
      },
    });
    await client.searchRepos({ query: "demo" });
    expect(decodeURIComponent(urls[1].replace(/\+/g, " "))).toContain("demo in:name user:octo");
  });
});

describe("blobs", () => {
  it("decodes text, flags binary and honours concurrency", async () => {
    const fake = new FakeGitHub({ "a.txt": "héllo\n", "b.txt": "B" });
    fake.commitBinary("img.dat", [0, 1, 2, 255]);
    fake.commitBinary("bad.txt", [0xff, 0xfe, 0x41]);
    const { client } = makeClient(fake);
    const tree = await client.getTree("octo", "demo", fake.commits.get(fake.head())!.tree, { recursive: true });
    const blobs = tree.entries.filter((e) => e.type === "blob");
    const result = await client.getBlobsBatch(
      "octo",
      "demo",
      blobs.map((b) => b.sha),
      { concurrency: 2 },
    );
    expect(result.get(gitBlobSha("héllo\n"))?.content).toBe("héllo\n");
    expect(result.get(blobs.find((b) => b.path === "img.dat")!.sha)?.content).toBeNull();
    expect(result.get(blobs.find((b) => b.path === "bad.txt")!.sha)?.content).toBeNull();
  });

  it("caches blobs so repeated reads cost no requests", async () => {
    const fake = new FakeGitHub({ "a.txt": "A" });
    const { client } = makeClient(fake);
    await client.getBlob("octo", "demo", gitBlobSha("A"));
    await client.getBlob("octo", "demo", gitBlobSha("A"));
    expect(fake.count("GET", /git\/blobs/)).toBe(1);
  });

  it("stops early and rejects when a download fails", async () => {
    const fake = new FakeGitHub({ "a.txt": "A" });
    const { client } = makeClient(fake);
    await expect(client.getBlobsBatch("octo", "demo", [gitBlobSha("A"), "f".repeat(40)])).rejects.toBeInstanceOf(GitHubNotFoundError);
  });
});

describe("commitChanges (Git Data API)", () => {
  it("creates blobs, one tree, one commit and a non-forced ref update", async () => {
    const fake = new FakeGitHub({ "a.txt": "A", "b.txt": "B", "c.txt": "C" });
    const { client } = makeClient(fake);
    const base = fake.head();
    const result = await client.commitChanges({
      owner: "octo",
      repo: "demo",
      branch: "main",
      baseCommitSha: base,
      message: "Update 3 files via Zuup Code",
      changes: [
        { path: "a.txt", content: "A2" },
        { path: "b.txt", content: null },
        { path: "d/new.txt", content: "N" },
      ],
    });
    expect(fake.files()).toEqual({ "a.txt": "A2", "c.txt": "C", "d/new.txt": "N" });
    expect(fake.head()).toBe(result.commitSha);
    expect(fake.commits.get(result.commitSha)).toMatchObject({ parents: [base], message: "Update 3 files via Zuup Code" });
    const patch = fake.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ sha: result.commitSha, force: false });
    expect(fake.count("POST", /git\/blobs/)).toBe(2);
    expect(fake.count("POST", /git\/trees/)).toBe(1);
    expect(fake.count("POST", /git\/commits/)).toBe(1);
  });

  it("sends content inline in chunked trees for large change sets", async () => {
    const fake = new FakeGitHub({ "keep.txt": "K" });
    const { client } = makeClient(fake);
    const changes = Array.from({ length: INLINE_CONTENT_THRESHOLD + 45 }, (_, i) => ({ path: `f/${i}.txt`, content: `file ${i}` }));
    await client.commitChanges({ owner: "octo", repo: "demo", branch: "main", baseCommitSha: fake.head(), message: "bulk", changes });
    expect(fake.count("POST", /git\/blobs/)).toBe(0);
    expect(fake.count("POST", /git\/trees/)).toBe(2); // 55 files -> chunks of 40 + 15
    expect(Object.keys(fake.files())).toHaveLength(56);
    expect(fake.files()["f/54.txt"]).toBe("file 54");
    expect(fake.commitCount()).toBe(2); // initial + one commit
  });

  it("preserves the executable bit when provided", async () => {
    const fake = new FakeGitHub({ "run.sh": "echo 1" });
    fake.setMode("run.sh", "100755");
    const { client } = makeClient(fake);
    await client.commitChanges({
      owner: "octo",
      repo: "demo",
      branch: "main",
      baseCommitSha: fake.head(),
      message: "m",
      changes: [{ path: "run.sh", content: "echo 2", mode: "100755" }],
    });
    const tree = fake.trees.get(fake.commits.get(fake.head())!.tree)!;
    expect(tree.get("run.sh")?.mode).toBe("100755");
  });

  it("rejects with a non-fast-forward conflict when the branch moved, leaving the branch untouched", async () => {
    const fake = new FakeGitHub({ "a.txt": "A" });
    const { client } = makeClient(fake);
    const base = fake.head();
    const theirs = fake.commitFiles({ "a.txt": "theirs" });
    const err = await client
      .commitChanges({ owner: "octo", repo: "demo", branch: "main", baseCommitSha: base, message: "m", changes: [{ path: "a.txt", content: "mine" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubConflictError);
    expect(err.isNonFastForward).toBe(true);
    expect(fake.head()).toBe(theirs);
    expect(fake.files()["a.txt"]).toBe("theirs");
  });

  it("serializes concurrent commits and paces writes", async () => {
    const fake = new FakeGitHub({ "a.txt": "A" });
    let clock = 0;
    const sleeps: number[] = [];
    const client = new GitHubClient({
      getToken: () => fake.token,
      fetch: fake.fetch,
      writeSpacingMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    const order: string[] = [];
    fake.onRequest = (req) => {
      if (req.method !== "GET") order.push(`${req.method} ${req.path.split("/git/")[1]}`);
    };
    const first = client.commitChanges({ owner: "octo", repo: "demo", branch: "main", baseCommitSha: fake.head(), message: "one", changes: [{ path: "x.txt", content: "1" }] });
    const second = client.createBranch("octo", "demo", "feature", fake.head()).catch(() => undefined);
    await Promise.all([first, second]);
    // The commit's four mutating requests finish before the next write starts.
    expect(order.slice(0, 4)).toEqual(["POST blobs", "POST trees", "POST commits", "PATCH refs/heads/main"]);
    expect(sleeps.length).toBeGreaterThanOrEqual(4);
    expect(sleeps.every((s) => s <= 1000)).toBe(true);
  });

  it("rejects an invalid path before any request", async () => {
    const fake = new FakeGitHub({ "a.txt": "A" });
    const { client } = makeClient(fake);
    const before = fake.calls.length;
    await expect(
      client.commitChanges({ owner: "octo", repo: "demo", branch: "main", baseCommitSha: fake.head(), message: "m", changes: [{ path: "/abs.txt", content: "x" }] }),
    ).rejects.toMatchObject({ code: "invalid_path" });
    expect(fake.calls.length).toBe(before);
  });
});

describe("createRepo / createBranch", () => {
  it("posts the expected bodies", async () => {
    const bodies: unknown[] = [];
    const client = new GitHubClient({
      getToken: () => "t",
      writeSpacingMs: 0,
      fetch: async (input, init) => {
        bodies.push([String(input), JSON.parse(String(init?.body))]);
        return String(input).endsWith("/user/repos")
          ? json({ id: 9, name: "new", full_name: "octo/new", owner: { login: "octo" }, private: true, html_url: "u" }, 201)
          : json({ ref: "refs/heads/feat", object: { sha: "abc" } }, 201);
      },
    });
    const repo = await client.createRepo({ name: "new", private: true, description: "d" });
    expect(repo).toMatchObject({ fullName: "octo/new", private: true });
    await client.createBranch("octo", "new", "feat", "abc");
    expect(bodies).toEqual([
      ["https://api.github.com/user/repos", { name: "new", private: true, description: "d", auto_init: true }],
      ["https://api.github.com/repos/octo/new/git/refs", { ref: "refs/heads/feat", sha: "abc" }],
    ]);
  });
});

describe("importRepo", () => {
  it("downloads text files into local files plus a base snapshot", async () => {
    const fake = new FakeGitHub({
      "main.py": "print('hi')\n",
      "lib/util.py": "x = 1\n",
      "app/index.js": "console.log(1)\n",
      "node_modules/x/index.js": "no",
      "logo.png": "not really a png",
    });
    fake.commitBinary("blob.dat", [0, 1, 2]);
    const { client } = makeClient(fake);
    const progress: string[] = [];
    const result = await importRepo(client, { owner: "octo", repo: "demo", branch: "main", onProgress: (p) => progress.push(`${p.phase}:${p.done}/${p.total}`) });
    expect(result.files.map((f) => f.path)).toEqual(["app/index.js", "lib/util.py", "main.py"]);
    expect(result.skipped.map((s) => s.path)).toEqual(["blob.dat"]);
    expect(result.baseTree["main.py"]).toBe(gitBlobSha("print('hi')\n"));
    expect(Object.keys(result.baseTree)).not.toContain("blob.dat");
    expect(result.commitSha).toBe(fake.head());
    expect(progress[0]).toBe("tree:0/1");
    expect(progress.at(-1)).toBe("files:4/4");

    const link = linkFromImport("proj-1", { owner: "octo", repo: "demo", branch: "main" }, result, {}, 123);
    expect(link).toMatchObject({ projectKey: "proj-1", autoPush: true, autoPull: true, lastSyncedCommitSha: fake.head(), lastSyncAt: 123, subdir: "" });
  });

  it("honours a sub-folder and strips the prefix", async () => {
    const fake = new FakeGitHub({ "app/index.js": "A", "app/lib/b.js": "B", "other/c.js": "C" });
    const { client } = makeClient(fake);
    const result = await importRepo(client, { owner: "octo", repo: "demo", branch: "main", subdir: "/app/" });
    expect(result.files.map((f) => f.path)).toEqual(["index.js", "lib/b.js"]);
  });

  it("fails clearly past the file cap and for a missing branch", async () => {
    const fake = new FakeGitHub({ "a.txt": "A", "b.txt": "B", "c.txt": "C" });
    const { client } = makeClient(fake);
    await expect(importRepo(client, { owner: "octo", repo: "demo", branch: "main", maxFiles: 2 })).rejects.toMatchObject({ code: "too_many_files" });
    await expect(importRepo(client, { owner: "octo", repo: "demo", branch: "nope" })).rejects.toBeInstanceOf(GitHubNotFoundError);
    await expect(importRepo(client, { owner: "octo", repo: "demo", branch: "main", subdir: "../x" })).rejects.toMatchObject({ code: "invalid_path" });
  });
});
