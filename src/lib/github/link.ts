/**
 * Project <-> repository links, persisted in localStorage.
 * `projectKey` is the cloud project id, or "scratch" for the unsaved workspace.
 */
import { DEFAULT_COMMIT_TEMPLATE, type ShaMap } from "./sync";

export const LINKS_STORAGE_KEY = "zuup_github_links_v1";
export const SCRATCH_PROJECT_KEY = "scratch";

export interface GitHubLink {
  projectKey: string;
  owner: string;
  repo: string;
  branch: string;
  /** Repository sub-folder that maps to the project root; "" for the repository root. */
  subdir: string;
  autoPush: boolean;
  autoPull: boolean;
  commitMessageTemplate: string;
  lastSyncedCommitSha: string | null;
  /** The last synced remote tree: local-space path -> blob sha. */
  baseTree: ShaMap;
  lastSyncAt: number | null;
}

export type NewGitHubLink = Pick<GitHubLink, "projectKey" | "owner" | "repo" | "branch"> & Partial<GitHubLink>;

export function createLink(input: NewGitHubLink): GitHubLink {
  return {
    subdir: "",
    autoPush: true,
    autoPull: true,
    commitMessageTemplate: DEFAULT_COMMIT_TEMPLATE,
    lastSyncedCommitSha: null,
    baseTree: {},
    lastSyncAt: null,
    ...input,
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function sanitize(value: unknown): GitHubLink | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  const projectKey = str(v.projectKey);
  const owner = str(v.owner);
  const repo = str(v.repo);
  const branch = str(v.branch);
  if (!projectKey || !owner || !repo || !branch) return null;
  const baseTree: ShaMap = {};
  if (v.baseTree && typeof v.baseTree === "object") {
    for (const [path, sha] of Object.entries(v.baseTree as Record<string, unknown>)) {
      if (typeof sha === "string") baseTree[path] = sha;
    }
  }
  return createLink({
    projectKey,
    owner,
    repo,
    branch,
    subdir: typeof v.subdir === "string" ? v.subdir : "",
    autoPush: v.autoPush !== false,
    autoPull: v.autoPull !== false,
    commitMessageTemplate: typeof v.commitMessageTemplate === "string" ? v.commitMessageTemplate : DEFAULT_COMMIT_TEMPLATE,
    lastSyncedCommitSha: str(v.lastSyncedCommitSha),
    baseTree,
    lastSyncAt: typeof v.lastSyncAt === "number" ? v.lastSyncAt : null,
  });
}

function readAll(): Record<string, GitHubLink> {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(LINKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, GitHubLink> = {};
    for (const value of Object.values(parsed ?? {})) {
      const link = sanitize(value);
      if (link) out[link.projectKey] = link;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(links: Record<string, GitHubLink>): boolean {
  try {
    storage()?.setItem(LINKS_STORAGE_KEY, JSON.stringify(links));
    return storage() !== null;
  } catch {
    return false;
  }
}

export function listLinks(): GitHubLink[] {
  return Object.values(readAll());
}

export function getLink(projectKey: string): GitHubLink | null {
  return readAll()[projectKey] ?? null;
}

/** Persists the link; returns false when storage is unavailable or full. */
export function saveLink(link: GitHubLink): boolean {
  const all = readAll();
  all[link.projectKey] = link;
  return writeAll(all);
}

export function removeLink(projectKey: string): void {
  const all = readAll();
  if (!(projectKey in all)) return;
  delete all[projectKey];
  writeAll(all);
}

/**
 * Re-keys a link, e.g. when the scratch workspace is saved as a real project.
 * Refuses (returns null) if `to` already has a link or `from` has none.
 */
export function moveLink(from: string, to: string): GitHubLink | null {
  if (from === to) return getLink(from);
  const all = readAll();
  const link = all[from];
  if (!link || all[to]) return null;
  const moved: GitHubLink = { ...link, projectKey: to };
  delete all[from];
  all[to] = moved;
  return writeAll(all) ? moved : null;
}
