/**
 * Public API of the GitHub sync library. UI code should import from "@/lib/github" only.
 * See docs/GITHUB_SYNC.md for an overview and a usage example.
 */
export * from "./errors";
export * from "./auth";
export {
  GITHUB_API_BASE,
  GitHubClient,
  createGitHubClient,
  parseLinkHeader,
  type BlobResult,
  type BranchRef,
  type BranchSummary,
  type CommitChangesInput,
  type CommitInfo,
  type CommitResult,
  type FileChange,
  type GitHubClientOptions,
  type ListReposOptions,
  type RateLimitInfo,
  type RepoSummary,
  type TreeEntry,
  type TreeResult,
  type Viewer,
} from "./client";
export * from "./paths";
export { gitBlobSha, sha1Hex } from "./sha";
export {
  DEFAULT_COMMIT_TEMPLATE,
  ShaMemo,
  applyPull,
  applyShaUpdates,
  buildConflicts,
  buildRemoteSnapshot,
  detectMassDelete,
  MASS_DELETE_MIN_FILES,
  MASS_DELETE_MIN_RATIO,
  classifyPath,
  formatCommitMessage,
  hashFiles,
  planPull,
  planPush,
  planSync,
  resolveConflict,
  type AppliedChange,
  type ChangeKind,
  type Conflict,
  type ConflictKind,
  type ConflictRef,
  type ConflictResolution,
  type MassDelete,
  type PathState,
  type PlanInput,
  type PullChange,
  type PushChange,
  type RemoteSnapshot,
  type Resolution,
  type ShaMap,
  type SyncPlan,
} from "./sync";
export * from "./link";
export * from "./controller";
export { importRepo, linkFromImport, type ImportOptions, type ImportProgress, type ImportResult } from "./importRepo";
export { fetchRemoteSnapshot } from "./remote";
