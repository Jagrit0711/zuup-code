import type { GitHubClient } from "./client";
import { GitHubSyncError } from "./errors";
import { createLink, type GitHubLink } from "./link";
import { type LocalFile, type SkippedPath, MAX_FILES, normalizeSubdir } from "./paths";
import { fetchRemoteSnapshot, resolveBranchHead } from "./remote";
import { type RemoteSnapshot, type ShaMap, excludeShas } from "./sync";

export interface ImportProgress {
  phase: "tree" | "files";
  done: number;
  total: number;
}

export interface ImportOptions {
  owner: string;
  repo: string;
  branch: string;
  subdir?: string;
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
  maxFiles?: number;
}

export interface ImportResult {
  files: LocalFile[];
  snapshot: RemoteSnapshot;
  /** Ready to store as GitHubLink.baseTree. */
  baseTree: ShaMap;
  commitSha: string;
  skipped: SkippedPath[];
}

/**
 * Downloads a repository (or sub-folder) as local files plus the base snapshot needed to start
 * syncing from a clean state. Binary, oversized and ignored files are skipped and reported.
 */
export async function importRepo(client: GitHubClient, options: ImportOptions): Promise<ImportResult> {
  const subdir = normalizeSubdir(options.subdir);
  if (subdir === null) throw new GitHubSyncError("The sub-folder path is not valid.", "invalid_path");
  const maxFiles = options.maxFiles ?? MAX_FILES;

  options.onProgress?.({ phase: "tree", done: 0, total: 1 });
  const head = await resolveBranchHead(client, options.owner, options.repo, options.branch);
  let snapshot = await fetchRemoteSnapshot(client, { owner: options.owner, repo: options.repo, commitSha: head, subdir });
  options.onProgress?.({ phase: "tree", done: 1, total: 1 });

  const paths = Object.keys(snapshot.files);
  if (paths.length > maxFiles) {
    throw new GitHubSyncError(
      `This repository has ${paths.length} syncable files; GitHub sync supports at most ${maxFiles}. Choose a sub-folder.`,
      "too_many_files",
    );
  }

  const blobs = await client.getBlobsBatch(
    options.owner,
    options.repo,
    paths.map((p) => snapshot.files[p]),
    {
      signal: options.signal,
      onProgress: (done, total) => options.onProgress?.({ phase: "files", done, total }),
    },
  );

  const binary = new Set<string>();
  const files: LocalFile[] = [];
  for (const path of paths) {
    const blob = blobs.get(snapshot.files[path]);
    if (blob && blob.content !== null) files.push({ path, content: blob.content });
    else binary.add(snapshot.files[path]);
  }
  if (binary.size > 0) snapshot = excludeShas(snapshot, binary);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const skipped: SkippedPath[] = snapshot.skipped.map((path) => ({ path, reason: "remote-unsyncable" }));
  return { files, snapshot, baseTree: { ...snapshot.files }, commitSha: snapshot.commitSha, skipped };
}

/** Builds the link that goes with an import (base = what was just downloaded). */
export function linkFromImport(
  projectKey: string,
  options: Pick<ImportOptions, "owner" | "repo" | "branch" | "subdir">,
  result: ImportResult,
  overrides: Partial<GitHubLink> = {},
  now: number = Date.now(),
): GitHubLink {
  return createLink({
    projectKey,
    owner: options.owner,
    repo: options.repo,
    branch: options.branch,
    subdir: normalizeSubdir(options.subdir) ?? "",
    baseTree: result.baseTree,
    lastSyncedCommitSha: result.commitSha,
    lastSyncAt: now,
    ...overrides,
  });
}
