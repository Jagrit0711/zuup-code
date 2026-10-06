/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed request bodies in a test double */
/**
 * In-memory fake of the slice of the GitHub REST API the sync library uses.
 * Test support only: it is not exported from index.ts and never imported by app code.
 */
import { sha1Hex } from "../sha";
import { utf8Decode, utf8Encode } from "../utf8";

interface TreeItem {
  mode: string;
  sha: string;
}

interface Failure {
  match: (method: string, path: string) => boolean;
  respond: () => Response;
  times: number;
}

export interface FakeRequest {
  method: string;
  path: string;
  body: unknown | undefined;
}

function blobShaOfBytes(bytes: Uint8Array): string {
  const header = utf8Encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header);
  all.set(bytes, header.length);
  return sha1Hex(all);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class FakeGitHub {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  token = "good-token";
  scopes = "repo";
  blobs = new Map<string, Uint8Array>();
  trees = new Map<string, Map<string, TreeItem>>();
  commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  heads = new Map<string, string>();
  calls: FakeRequest[] = [];
  /** Runs before a request is handled; may call commitFiles() to simulate a concurrent push. */
  onRequest: ((req: FakeRequest) => void | Promise<void>) | null = null;
  /** When set, fetch rejects like an offline browser. */
  offline = false;
  /** Number of 304 Not Modified answers served (proves conditional requests are used). */
  notModified = 0;
  private failures: Failure[] = [];
  private counter = 0;

  constructor(files: Record<string, string> = {}, options: { owner?: string; repo?: string; branch?: string } = {}) {
    this.owner = options.owner ?? "octo";
    this.repo = options.repo ?? "demo";
    this.branch = options.branch ?? "main";
    this.commitFiles(files, "initial commit");
  }

  // ------------------------------------------------------------ inspection

  head(): string {
    return this.heads.get(this.branch) as string;
  }

  /** Text files at the head of the branch (binary blobs are omitted). */
  files(): Record<string, string> {
    const out: Record<string, string> = {};
    const tree = this.trees.get(this.commits.get(this.head())!.tree)!;
    for (const [path, item] of tree) {
      const text = utf8Decode(this.blobs.get(item.sha) as Uint8Array);
      if (text !== null) out[path] = text;
    }
    return out;
  }

  count(method: string, pattern: RegExp): number {
    return this.calls.filter((c) => c.method === method && pattern.test(c.path)).length;
  }

  commitCount(): number {
    return this.commits.size;
  }

  // -------------------------------------------------------------- mutation

  private putBlob(bytes: Uint8Array): string {
    const sha = blobShaOfBytes(bytes);
    this.blobs.set(sha, bytes);
    return sha;
  }

  private putTree(items: Map<string, TreeItem>): string {
    const sorted = Array.from(items.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
    const sha = sha1Hex(utf8Encode(`tree:${JSON.stringify(sorted)}`));
    this.trees.set(sha, new Map(sorted));
    return sha;
  }

  private putCommit(tree: string, parents: string[], message: string): string {
    const sha = sha1Hex(utf8Encode(`commit:${tree}:${parents.join(",")}:${message}:${this.counter++}`));
    this.commits.set(sha, { tree, parents, message });
    return sha;
  }

  /** Simulates another person pushing: set (string) or delete (null) files in one commit. */
  commitFiles(changes: Record<string, string | null>, message = "remote edit"): string {
    const parent = this.heads.get(this.branch);
    const items = new Map<string, TreeItem>(parent ? this.trees.get(this.commits.get(parent)!.tree)! : []);
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) items.delete(path);
      else items.set(path, { mode: "100644", sha: this.putBlob(utf8Encode(content)) });
    }
    const sha = this.putCommit(this.putTree(items), parent ? [parent] : [], message);
    this.heads.set(this.branch, sha);
    return sha;
  }

  /** Adds a binary file (e.g. an image) in a new commit. */
  commitBinary(path: string, bytes: number[], message = "add binary"): string {
    const parent = this.head();
    const items = new Map(this.trees.get(this.commits.get(parent)!.tree)!);
    items.set(path, { mode: "100644", sha: this.putBlob(new Uint8Array(bytes)) });
    const sha = this.putCommit(this.putTree(items), [parent], message);
    this.heads.set(this.branch, sha);
    return sha;
  }

  setMode(path: string, mode: string): void {
    const parent = this.head();
    const items = new Map(this.trees.get(this.commits.get(parent)!.tree)!);
    const item = items.get(path)!;
    items.set(path, { ...item, mode });
    this.heads.set(this.branch, this.putCommit(this.putTree(items), [parent], `chmod ${path}`));
  }

  /** Makes the next `times` matching requests fail with the given response. */
  failNext(match: RegExp | ((method: string, path: string) => boolean), respond: () => Response, times = 1): void {
    const fn = match instanceof RegExp ? (_m: string, p: string) => match.test(p) : match;
    this.failures.push({ match: fn, respond, times });
  }

  // ----------------------------------------------------------------- fetch

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.offline) throw new TypeError("Failed to fetch");
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const path = url.pathname + url.search;
    const req: FakeRequest = { method, path, body };
    this.calls.push(req);

    if (headers.get("authorization") !== `Bearer ${this.token}`) {
      return this.json({ message: "Bad credentials" }, 401);
    }
    if (this.onRequest) await this.onRequest(req);
    for (const failure of this.failures) {
      if (failure.times > 0 && failure.match(method, path)) {
        failure.times--;
        return failure.respond();
      }
    }
    return this.route(method, url.pathname, url.searchParams, headers, body);
  };

  private json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-ratelimit-remaining": "4990", "x-ratelimit-limit": "5000", ...extra },
    });
  }

  private route(method: string, pathname: string, query: URLSearchParams, headers: Headers, body: any): Response {
    if (method === "GET" && pathname === "/user") {
      return this.json({ login: "octo", id: 1, name: "Octo Cat", avatar_url: "https://avatars/octo", html_url: "https://github.com/octo" }, 200, {
        "x-oauth-scopes": this.scopes,
      });
    }
    const m = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/(.+)$/);
    if (!m || m[1] !== this.owner || m[2] !== this.repo) return this.json({ message: "Not Found" }, 404);
    const rest = m[3];

    let r: RegExpMatchArray | null;
    if (method === "GET" && (r = rest.match(/^ref\/heads\/(.+)$/))) {
      const sha = this.heads.get(decodeURIComponent(r[1]));
      if (!sha) return this.json({ message: "Not Found" }, 404);
      const etag = `"ref-${sha}"`;
      if (headers.get("if-none-match") === etag) {
        this.notModified++;
        return new Response(null, { status: 304, headers: { etag } });
      }
      return this.json({ ref: `refs/heads/${r[1]}`, object: { sha, type: "commit" } }, 200, { etag });
    }
    if (method === "GET" && (r = rest.match(/^commits\/(\w+)$/))) {
      const c = this.commits.get(r[1]);
      if (!c) return this.json({ message: "Not Found" }, 404);
      return this.json({ sha: r[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message, html_url: `https://github.com/commit/${r[1]}` });
    }
    if (method === "GET" && (r = rest.match(/^trees\/(\w+)$/))) {
      const tree = this.trees.get(r[1]);
      if (!tree) return this.json({ message: "Not Found" }, 404);
      const entries: unknown[] = [];
      const dirs = new Set<string>();
      for (const [path, item] of tree) {
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
        entries.push({ path, mode: item.mode, type: "blob", sha: item.sha, size: (this.blobs.get(item.sha) as Uint8Array).length });
      }
      for (const dir of dirs) entries.push({ path: dir, mode: "040000", type: "tree", sha: "d".repeat(40) });
      return this.json({ sha: r[1], tree: entries, truncated: false });
    }
    if (method === "GET" && (r = rest.match(/^blobs\/(\w+)$/))) {
      const bytes = this.blobs.get(r[1]);
      if (!bytes) return this.json({ message: "Not Found" }, 404);
      return this.json({ sha: r[1], size: bytes.length, encoding: "base64", content: toBase64(bytes).replace(/(.{60})/g, "$1\n") });
    }
    if (method === "POST" && rest === "blobs") {
      const bytes = body.encoding === "base64" ? Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)) : utf8Encode(body.content);
      return this.json({ sha: this.putBlob(bytes) }, 201);
    }
    if (method === "POST" && rest === "trees") {
      const items = new Map<string, TreeItem>(body.base_tree ? this.trees.get(body.base_tree) ?? [] : []);
      for (const e of body.tree as any[]) {
        if (e.sha === null) {
          if (!items.has(e.path)) return this.json({ message: `GitRPC::BadObjectState: ${e.path} not in tree` }, 422);
          items.delete(e.path);
        } else if (typeof e.content === "string") {
          items.set(e.path, { mode: e.mode ?? "100644", sha: this.putBlob(utf8Encode(e.content)) });
        } else if (this.blobs.has(e.sha)) {
          items.set(e.path, { mode: e.mode ?? "100644", sha: e.sha });
        } else {
          return this.json({ message: "tree.sha references a missing object" }, 422);
        }
      }
      return this.json({ sha: this.putTree(items) }, 201);
    }
    if (method === "POST" && rest === "commits") {
      if (!this.trees.has(body.tree)) return this.json({ message: "Tree does not exist" }, 422);
      const sha = this.putCommit(body.tree, body.parents, body.message);
      return this.json({ sha, html_url: `https://github.com/${this.owner}/${this.repo}/commit/${sha}` }, 201);
    }
    if (method === "PATCH" && (r = rest.match(/^refs\/heads\/(.+)$/))) {
      const name = decodeURIComponent(r[1]);
      const current = this.heads.get(name);
      if (!current) return this.json({ message: "Reference does not exist" }, 422);
      if (!this.commits.has(body.sha)) return this.json({ message: "Object does not exist" }, 422);
      if (!body.force) {
        let cursor: string[] = [body.sha];
        let found = false;
        while (cursor.length && !found) {
          const next: string[] = [];
          for (const sha of cursor) {
            if (sha === current) found = true;
            else next.push(...(this.commits.get(sha)?.parents ?? []));
          }
          cursor = next;
        }
        if (!found) return this.json({ message: "Update is not a fast forward" }, 422);
      }
      this.heads.set(name, body.sha);
      return this.json({ ref: `refs/heads/${name}`, object: { sha: body.sha } });
    }
    return this.json({ message: "Not Found" }, 404);
  }
}
