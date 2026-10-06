/**
 * Small, dependency-free GitHub REST client for the browser.
 *
 * - Bearer auth, JSON, pinned API version.
 * - Typed errors, rate-limit awareness (Retry-After / x-ratelimit-reset) with
 *   exponential backoff + jitter, and strictly serialized, paced writes.
 * - ETag conditional GETs (a 304 does not count against the rate limit).
 * - Commits through the Git Data API so many files change in ONE atomic commit.
 */
import { getAuth } from "./auth";
import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubError,
  GitHubNetworkError,
  GitHubNotFoundError,
  GitHubPermissionError,
  GitHubRateLimitError,
  GitHubSyncError,
} from "./errors";
import { MAX_FILE_BYTES } from "./paths";
import { base64ToBytes, hasNulByte, utf8ByteLength, utf8Decode } from "./utf8";

export const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** Above this many changed files the commit sends content inline in tree requests instead of one blob request per file. */
export const INLINE_CONTENT_THRESHOLD = 10;
const INLINE_CHUNK_MAX_FILES = 40;
const INLINE_CHUNK_MAX_BYTES = 1_500_000;
const BLOB_CACHE_MAX_CHARS = 8_000_000;

export interface GitHubClientOptions {
  /** Called for every request so a token change takes effect immediately. */
  getToken: () => string | null | undefined;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Retries for 5xx / network errors on GET and for short rate-limit waits. Default 2. */
  maxRetries?: number;
  /** Minimum gap between two mutating requests. Default 1000 ms (GitHub's secondary-limit guidance). */
  writeSpacingMs?: number;
  /** Rate-limit waits longer than this are surfaced instead of slept on. Default 30 s. */
  maxRetryWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface RepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  pushedAt: string | null;
  canPush: boolean | null;
}

export interface Viewer {
  login: string;
  id: number;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
}

export interface BranchSummary {
  name: string;
  sha: string;
  protected: boolean;
}

export interface BranchRef {
  /** Head commit sha. null only for a 304 when no cached copy exists. */
  sha: string | null;
  etag: string | null;
  notModified: boolean;
}

export interface CommitInfo {
  sha: string;
  treeSha: string;
  parents: string[];
  message: string;
  htmlUrl: string;
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit" | string;
  sha: string;
  size?: number;
}

export interface TreeResult {
  sha: string;
  entries: TreeEntry[];
  truncated: boolean;
}

export interface BlobResult {
  sha: string;
  size: number;
  /** null when the blob is not valid UTF-8 text (binary), contains NUL bytes, or is too large. */
  content: string | null;
}

export interface FileChange {
  path: string;
  /** null deletes the file. */
  content: string | null;
  /** Git file mode; defaults to 100644. */
  mode?: string;
}

export interface CommitChangesInput {
  owner: string;
  repo: string;
  branch: string;
  baseCommitSha: string;
  /** Tree sha of the base commit; fetched when omitted. */
  baseTreeSha?: string;
  message: string;
  changes: FileChange[];
}

export interface CommitResult {
  commitSha: string;
  treeSha: string;
  url: string;
}

export interface ListReposOptions {
  query?: string;
  page?: number;
  perPage?: number;
  affiliation?: string;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
}

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  owner?: { login?: string };
  private?: boolean;
  default_branch?: string;
  description?: string | null;
  html_url: string;
  pushed_at?: string | null;
  permissions?: { push?: boolean; admin?: boolean };
}

interface RawUser {
  login: string;
  id: number;
  name?: string | null;
  avatar_url?: string | null;
  html_url: string;
}

interface RawBranch {
  name: string;
  commit?: { sha: string };
  protected?: boolean;
}

interface RawRef {
  object?: { sha?: string };
}

interface RawCommit {
  sha: string;
  tree: { sha: string };
  parents?: Array<{ sha: string }>;
  message?: string;
  html_url?: string;
}

interface RawTree {
  sha: string;
  tree?: TreeEntry[];
  truncated?: boolean;
}

interface RawBlob {
  size?: number;
  encoding?: string;
  content?: string;
}

interface RawCreated {
  sha: string;
  html_url?: string;
  ref?: string;
  object?: { sha?: string };
}

interface RawResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  etag?: string | null;
  signal?: AbortSignal;
  write?: boolean;
}

const enc = encodeURIComponent;
const encodeRef = (branch: string) => branch.split("/").map(enc).join("/");

export function parseLinkHeader(header: string | null): { next?: string; prev?: string } {
  const out: { next?: string; prev?: string } = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="(\w+)"/);
    if (m && (m[2] === "next" || m[2] === "prev")) out[m[2]] = m[1];
  }
  return out;
}

function mapRepo(r: RawRepo): RepoSummary {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner?.login ?? String(r.full_name).split("/")[0],
    private: !!r.private,
    defaultBranch: r.default_branch ?? "main",
    description: r.description ?? null,
    htmlUrl: r.html_url,
    pushedAt: r.pushed_at ?? null,
    canPush: r.permissions ? !!(r.permissions.push || r.permissions.admin) : null,
  };
}

export class GitHubClient {
  private readonly opts: Required<Omit<GitHubClientOptions, "fetch">> & { fetch?: typeof fetch };
  private etagCache = new Map<string, { etag: string; data: unknown }>();
  private blobCache = new Map<string, BlobResult>();
  private blobCacheChars = 0;
  private writeChain: Promise<unknown> = Promise.resolve();
  private lastWriteAt = 0;
  private lastToken: string | null = null;
  private viewerCache: Viewer | null = null;
  private rateLimit: RateLimitInfo | null = null;

  constructor(options: GitHubClientOptions) {
    this.opts = {
      getToken: options.getToken,
      fetch: options.fetch,
      baseUrl: (options.baseUrl ?? GITHUB_API_BASE).replace(/\/$/, ""),
      maxRetries: options.maxRetries ?? 2,
      writeSpacingMs: options.writeSpacingMs ?? 1000,
      maxRetryWaitMs: options.maxRetryWaitMs ?? 30_000,
      sleep: options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? (() => Date.now()),
      random: options.random ?? Math.random,
    };
  }

  /** Last rate-limit headers seen, for display. */
  getRateLimit(): RateLimitInfo | null {
    return this.rateLimit;
  }

  /** Forgets cached ETags, blobs and the viewer (used on sign-out). */
  clearCaches(): void {
    this.etagCache.clear();
    this.blobCache.clear();
    this.blobCacheChars = 0;
    this.viewerCache = null;
  }

  // ------------------------------------------------------------ transport

  private token(): string {
    const token = this.opts.getToken();
    if (!token) throw new GitHubAuthError("Not signed in to GitHub.");
    if (token !== this.lastToken) {
      if (this.lastToken !== null) this.clearCaches();
      this.lastToken = token;
    }
    return token;
  }

  private url(path: string, query?: RequestOptions["query"]): string {
    let url: string;
    if (/^https?:\/\//i.test(path)) {
      // The token must never be sent anywhere but the API host (e.g. a hostile Link header).
      if (!path.startsWith(`${this.opts.baseUrl}/`)) {
        throw new GitHubError("Refusing to send credentials to a foreign host.", "invalid_url");
      }
      url = path;
    } else {
      url = this.opts.baseUrl + path;
    }
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
      const qs = params.toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    return url;
  }

  private backoffMs(attempt: number): number {
    return 500 * 2 ** attempt * (1 + this.opts.random() * 0.5);
  }

  private async paceWrite(): Promise<void> {
    const wait = this.lastWriteAt + this.opts.writeSpacingMs - this.opts.now();
    if (wait > 0) await this.opts.sleep(wait);
    this.lastWriteAt = this.opts.now();
  }

  private recordRateLimit(headers: Headers): void {
    const num = (name: string) => {
      const v = headers.get(name);
      return v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
    };
    const remaining = num("x-ratelimit-remaining");
    if (remaining === null) return;
    const reset = num("x-ratelimit-reset");
    this.rateLimit = { limit: num("x-ratelimit-limit"), remaining, resetAt: reset === null ? null : reset * 1000 };
  }

  private mapError(status: number, headers: Headers, body: unknown): GitHubError {
    const message =
      body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : `GitHub request failed (${status}).`;
    if (status === 401) return new GitHubAuthError(message);
    if (status === 403 || status === 429) {
      const retryAfterHeader = headers.get("retry-after");
      const reset = headers.get("x-ratelimit-reset");
      const exhausted = headers.get("x-ratelimit-remaining") === "0";
      if (status === 429 || exhausted || retryAfterHeader !== null || /rate limit/i.test(message)) {
        const retryAfter = retryAfterHeader !== null && !Number.isNaN(Number(retryAfterHeader)) ? Number(retryAfterHeader) : null;
        return new GitHubRateLimitError(message, {
          status,
          retryAfter,
          resetAt: exhausted && reset ? Number(reset) * 1000 : null,
        });
      }
      if (/bad credentials/i.test(message)) return new GitHubAuthError(message, status);
      return new GitHubPermissionError(message);
    }
    if (status === 404) return new GitHubNotFoundError(message);
    if (status === 409) {
      return new GitHubConflictError(message, /empty/i.test(message) ? "empty_repository" : "conflict", status);
    }
    if (status === 422) {
      if (/fast.?forward/i.test(message)) return new GitHubConflictError(message, "non_fast_forward", status);
      if (/already exists/i.test(message)) return new GitHubConflictError(message, "already_exists", status);
      return new GitHubError(message, "validation", status);
    }
    return new GitHubError(message, `http_${status}`, status);
  }

  private async request(method: string, path: string, options: RequestOptions = {}): Promise<RawResponse> {
    const url = this.url(path, options.query);
    const isRead = method === "GET";
    for (let attempt = 0; ; attempt++) {
      const token = this.token();
      if (options.write) await this.paceWrite();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
      };
      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.etag) headers["If-None-Match"] = options.etag;

      let res: Response;
      try {
        const doFetch = this.opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
        res = await doFetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          cache: "no-store",
          signal: options.signal,
        });
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") throw error;
        if (isRead && attempt < this.opts.maxRetries) {
          await this.opts.sleep(this.backoffMs(attempt));
          continue;
        }
        throw new GitHubNetworkError();
      }

      this.recordRateLimit(res.headers);
      if (res.status === 304) return { status: 304, headers: res.headers, body: null };

      let body: unknown = null;
      const text = await res.text().catch(() => "");
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      if (res.ok) return { status: res.status, headers: res.headers, body };

      const error = this.mapError(res.status, res.headers, body);
      if (error instanceof GitHubRateLimitError && attempt < this.opts.maxRetries) {
        const wait = error.retryAtMs(this.opts.now()) - this.opts.now();
        if (wait <= this.opts.maxRetryWaitMs) {
          await this.opts.sleep(Math.max(wait, 0) + this.opts.random() * 500);
          continue;
        }
      }
      if (isRead && res.status >= 500 && attempt < this.opts.maxRetries) {
        await this.opts.sleep(this.backoffMs(attempt));
        continue;
      }
      throw error;
    }
  }

  /** Serializes a unit of mutating work so two commits never interleave. */
  private withWriteLock<T>(job: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(job, job);
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  private async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return (await this.request("GET", path, options)).body as T;
  }

  /**
   * ETag-aware GET. On 304 the cached payload is returned with notModified=true.
   * An explicit `etag` overrides the cached one.
   */
  async getConditional<T>(
    path: string,
    options: { etag?: string | null; query?: RequestOptions["query"]; signal?: AbortSignal } = {},
  ): Promise<{ data: T | null; etag: string | null; notModified: boolean }> {
    const key = this.url(path, options.query);
    this.token();
    const cached = this.etagCache.get(key);
    const sendEtag = options.etag ?? cached?.etag ?? null;
    const res = await this.request("GET", path, { query: options.query, etag: sendEtag, signal: options.signal });
    if (res.status === 304) {
      return { data: (cached?.data as T | undefined) ?? null, etag: sendEtag, notModified: true };
    }
    const etag = res.headers.get("etag");
    if (etag) this.etagCache.set(key, { etag, data: res.body });
    return { data: res.body as T, etag, notModified: false };
  }

  /** Follows `Link: rel="next"` pages (same host only) and concatenates the mapped items. */
  async paginate<T, R = T>(
    path: string,
    options: { query?: RequestOptions["query"]; perPage?: number; maxPages?: number; map?: (item: T) => R; signal?: AbortSignal } = {},
  ): Promise<R[]> {
    const out: R[] = [];
    const maxPages = options.maxPages ?? 10;
    let next: string | undefined = path;
    let query: RequestOptions["query"] | undefined = { per_page: options.perPage ?? 100, ...options.query };
    for (let page = 0; next && page < maxPages; page++) {
      const res = await this.request("GET", next, { query, signal: options.signal });
      const items = Array.isArray(res.body) ? (res.body as T[]) : [];
      for (const item of items) out.push(options.map ? options.map(item) : (item as unknown as R));
      next = parseLinkHeader(res.headers.get("link")).next;
      query = undefined; // the next-page URL already carries its query string
    }
    return out;
  }

  // -------------------------------------------------------------- reading

  async getViewer(): Promise<Viewer> {
    if (this.viewerCache) {
      this.token();
      return this.viewerCache;
    }
    const u = await this.get<RawUser>("/user");
    this.viewerCache = {
      login: u.login,
      id: u.id,
      name: u.name ?? null,
      avatarUrl: u.avatar_url ?? null,
      htmlUrl: u.html_url,
    };
    return this.viewerCache;
  }

  /**
   * One page of the viewer's repositories, newest push first. GitHub has no name filter on this
   * endpoint, so `query` filters the returned page by name; use searchRepos for a server-side search.
   */
  async listRepos(options: ListReposOptions = {}): Promise<{ repos: RepoSummary[]; hasNextPage: boolean }> {
    const perPage = options.perPage ?? 30;
    const res = await this.request("GET", "/user/repos", {
      query: {
        per_page: perPage,
        page: options.page ?? 1,
        sort: "pushed",
        direction: "desc",
        affiliation: options.affiliation ?? "owner,collaborator,organization_member",
      },
    });
    let repos = (Array.isArray(res.body) ? (res.body as RawRepo[]) : []).map(mapRepo);
    const q = options.query?.trim().toLowerCase();
    if (q) repos = repos.filter((r) => r.fullName.toLowerCase().includes(q));
    return { repos, hasNextPage: !!parseLinkHeader(res.headers.get("link")).next };
  }

  /** Search fallback for accounts with many repositories. Searches repos owned by `owner` (default: the viewer). */
  async searchRepos(options: { query: string; owner?: string; page?: number; perPage?: number }): Promise<{
    repos: RepoSummary[];
    hasNextPage: boolean;
  }> {
    const owner = options.owner ?? (await this.getViewer()).login;
    const q = `${options.query.trim()} in:name user:${owner} fork:true`;
    const res = await this.request("GET", "/search/repositories", {
      query: { q, per_page: options.perPage ?? 30, page: options.page ?? 1, sort: "updated" },
    });
    const items = (res.body as { items?: RawRepo[] } | null)?.items;
    return {
      repos: (Array.isArray(items) ? items : []).map(mapRepo),
      hasNextPage: !!parseLinkHeader(res.headers.get("link")).next,
    };
  }

  async getRepo(owner: string, repo: string): Promise<RepoSummary> {
    return mapRepo(await this.get<RawRepo>(`/repos/${enc(owner)}/${enc(repo)}`));
  }

  async listBranches(owner: string, repo: string): Promise<BranchSummary[]> {
    return this.paginate<RawBranch, BranchSummary>(`/repos/${enc(owner)}/${enc(repo)}/branches`, {
      maxPages: 5,
      map: (b) => ({ name: b.name, sha: b.commit?.sha ?? "", protected: !!b.protected }),
    });
  }

  /** Head of a branch, using ETags so an unchanged branch costs no rate limit. */
  async getBranchRef(owner: string, repo: string, branch: string, options: { etag?: string | null } = {}): Promise<BranchRef> {
    const r = await this.getConditional<RawRef>(`/repos/${enc(owner)}/${enc(repo)}/git/ref/heads/${encodeRef(branch)}`, {
      etag: options.etag,
    });
    return { sha: r.data?.object?.sha ?? null, etag: r.etag, notModified: r.notModified };
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<CommitInfo> {
    const c = await this.get<RawCommit>(`/repos/${enc(owner)}/${enc(repo)}/git/commits/${enc(sha)}`);
    return {
      sha: c.sha,
      treeSha: c.tree.sha,
      parents: (c.parents ?? []).map((p) => p.sha),
      message: c.message ?? "",
      htmlUrl: c.html_url ?? `https://github.com/${owner}/${repo}/commit/${c.sha}`,
    };
  }

  async getTree(owner: string, repo: string, treeSha: string, options: { recursive?: boolean } = {}): Promise<TreeResult> {
    const t = await this.get<RawTree>(`/repos/${enc(owner)}/${enc(repo)}/git/trees/${enc(treeSha)}`, {
      query: options.recursive ? { recursive: 1 } : undefined,
    });
    return { sha: t.sha, entries: t.tree ?? [], truncated: !!t.truncated };
  }

  async getBlob(owner: string, repo: string, sha: string, options: { signal?: AbortSignal } = {}): Promise<BlobResult> {
    const cacheKey = `${owner}/${repo}@${sha}`.toLowerCase();
    const hit = this.blobCache.get(cacheKey);
    if (hit) return hit;
    const b = await this.get<RawBlob>(`/repos/${enc(owner)}/${enc(repo)}/git/blobs/${enc(sha)}`, { signal: options.signal });
    const size = typeof b.size === "number" ? b.size : 0;
    let content: string | null = null;
    if (size <= MAX_FILE_BYTES) {
      if (b.encoding === "base64") {
        const bytes = base64ToBytes(String(b.content ?? ""));
        content = hasNulByte(bytes) ? null : utf8Decode(bytes);
      } else if (typeof b.content === "string" && b.content.indexOf("\0") === -1) {
        content = b.content;
      }
    }
    const result: BlobResult = { sha, size, content };
    const chars = content?.length ?? 0;
    if (chars <= BLOB_CACHE_MAX_CHARS / 4) {
      for (const [key, old] of this.blobCache) {
        if (this.blobCacheChars + chars <= BLOB_CACHE_MAX_CHARS) break;
        this.blobCache.delete(key);
        this.blobCacheChars -= old.content?.length ?? 0;
      }
      this.blobCacheChars += chars;
      this.blobCache.set(cacheKey, result);
    }
    return result;
  }

  /** Downloads many blobs with bounded concurrency. Binary blobs come back with content null. */
  async getBlobsBatch(
    owner: string,
    repo: string,
    shas: string[],
    options: { concurrency?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
  ): Promise<Map<string, BlobResult>> {
    const unique = Array.from(new Set(shas));
    const results = new Map<string, BlobResult>();
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
    let cursor = 0;
    let done = 0;
    let failure: unknown = null;
    const worker = async () => {
      while (failure === null) {
        const index = cursor++;
        if (index >= unique.length) return;
        try {
          const blob = await this.getBlob(owner, repo, unique[index], { signal: options.signal });
          results.set(unique[index], blob);
          options.onProgress?.(++done, unique.length);
        } catch (error) {
          failure = error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
    if (failure !== null) throw failure;
    return results;
  }

  // -------------------------------------------------------------- writing

  async createRepo(input: { name: string; private: boolean; description?: string; autoInit?: boolean }): Promise<RepoSummary> {
    return this.withWriteLock(async () => {
      const r = await this.request("POST", "/user/repos", {
        write: true,
        body: {
          name: input.name,
          private: input.private,
          description: input.description ?? "",
          auto_init: input.autoInit ?? true,
        },
      });
      return mapRepo(r.body as RawRepo);
    });
  }

  async createBranch(owner: string, repo: string, branch: string, fromSha: string): Promise<{ ref: string; sha: string }> {
    return this.withWriteLock(async () => {
      const r = await this.request("POST", `/repos/${enc(owner)}/${enc(repo)}/git/refs`, {
        write: true,
        body: { ref: `refs/heads/${branch}`, sha: fromSha },
      });
      const body = r.body as RawCreated;
      return { ref: body.ref ?? `refs/heads/${branch}`, sha: body.object?.sha ?? fromSha };
    });
  }

  /**
   * Creates ONE commit containing all changes (blobs -> tree -> commit -> ref update, never forced).
   * Rejects with GitHubConflictError(code "non_fast_forward") when the branch moved in the meantime.
   */
  async commitChanges(input: CommitChangesInput): Promise<CommitResult> {
    const { owner, repo, branch } = input;
    const byPath = new Map<string, FileChange>();
    for (const change of input.changes) {
      if (!change.path || change.path.startsWith("/")) {
        throw new GitHubSyncError(`Invalid path "${change.path}".`, "invalid_path");
      }
      byPath.set(change.path, change);
    }
    const changes = Array.from(byPath.values());
    if (changes.length === 0) throw new GitHubSyncError("Nothing to commit.", "missing_content");
    const repoPath = `/repos/${enc(owner)}/${enc(repo)}`;

    return this.withWriteLock(async () => {
      const baseTreeSha = input.baseTreeSha ?? (await this.getCommit(owner, repo, input.baseCommitSha)).treeSha;
      const post = async (path: string, body: unknown) => (await this.request("POST", `${repoPath}${path}`, { write: true, body })).body as RawCreated;
      const upserts = changes.filter((c) => c.content !== null);
      const deletes = changes.filter((c) => c.content === null);
      const del = (c: FileChange) => ({ path: c.path, mode: "100644", type: "blob", sha: null as string | null });

      let treeSha = baseTreeSha;
      if (upserts.length <= INLINE_CONTENT_THRESHOLD) {
        const entries: unknown[] = deletes.map(del);
        for (const c of upserts) {
          const blob = await post("/git/blobs", { content: c.content, encoding: "utf-8" });
          entries.push({ path: c.path, mode: c.mode ?? "100644", type: "blob", sha: blob.sha });
        }
        treeSha = (await post("/git/trees", { base_tree: treeSha, tree: entries })).sha;
      } else {
        // Many files: ship content inline and chunk the trees to bound payload size.
        let chunk: unknown[] = deletes.map(del);
        let bytes = 0;
        const flush = async () => {
          if (chunk.length === 0) return;
          treeSha = (await post("/git/trees", { base_tree: treeSha, tree: chunk })).sha;
          chunk = [];
          bytes = 0;
        };
        for (const c of upserts) {
          const size = utf8ByteLength(c.content as string);
          if (chunk.length >= INLINE_CHUNK_MAX_FILES || (chunk.length > 0 && bytes + size > INLINE_CHUNK_MAX_BYTES)) await flush();
          chunk.push({ path: c.path, mode: c.mode ?? "100644", type: "blob", content: c.content });
          bytes += size;
        }
        await flush();
      }

      const commit = await post("/git/commits", { message: input.message, tree: treeSha, parents: [input.baseCommitSha] });
      await this.request("PATCH", `${repoPath}/git/refs/heads/${encodeRef(branch)}`, {
        write: true,
        body: { sha: commit.sha, force: false },
      });
      // The branch moved: any cached ref (ETag) is now stale.
      for (const key of Array.from(this.etagCache.keys())) if (key.includes(`${repoPath}/git/ref/`)) this.etagCache.delete(key);
      return {
        commitSha: commit.sha,
        treeSha: treeSha,
        url: commit.html_url ?? `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
      };
    });
  }
}

/** Creates a client that reads the token saved by auth.ts. */
export function createGitHubClient(options: Partial<GitHubClientOptions> = {}): GitHubClient {
  return new GitHubClient({
    getToken: () => getAuth()?.token ?? null,
    ...options,
  });
}
