import type { GitHubClient } from "./client";
import { GitHubNotFoundError, GitHubSyncError } from "./errors";
import { type RemoteSnapshot, buildRemoteSnapshot } from "./sync";

/** Downloads the recursive tree of a commit and turns it into a snapshot. */
export async function fetchRemoteSnapshot(
  client: GitHubClient,
  input: {
    owner: string;
    repo: string;
    commitSha: string;
    subdir: string;
    knownUnsyncable?: ReadonlySet<string>;
  },
): Promise<RemoteSnapshot> {
  const commit = await client.getCommit(input.owner, input.repo, input.commitSha);
  const tree = await client.getTree(input.owner, input.repo, commit.treeSha, { recursive: true });
  if (tree.truncated) {
    throw new GitHubSyncError(
      "This repository is too large to sync (GitHub truncated the file listing). Link a smaller repository or use a sub-folder.",
      "tree_truncated",
    );
  }
  return buildRemoteSnapshot({
    commitSha: commit.sha,
    treeSha: commit.treeSha,
    entries: tree.entries,
    subdir: input.subdir,
    knownUnsyncable: input.knownUnsyncable,
  });
}

/** Resolves the current head commit of a branch (always a fresh, unconditional read). */
export async function resolveBranchHead(client: GitHubClient, owner: string, repo: string, branch: string): Promise<string> {
  const ref = await client.getBranchRef(owner, repo, branch);
  if (!ref.sha) throw new GitHubNotFoundError(`Branch "${branch}" was not found.`);
  return ref.sha;
}
