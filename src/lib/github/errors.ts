/**
 * Typed errors for the GitHub sync library. Every error carries a stable
 * machine-readable `code` so UI code can branch without string matching.
 */

export class GitHubError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
    this.status = status;
  }
}

/** 401, or 403 "Bad credentials": the token is missing, revoked or expired. */
export class GitHubAuthError extends GitHubError {
  constructor(message = "GitHub rejected the access token.", status = 401) {
    super(message, "unauthorized", status);
    this.name = "GitHubAuthError";
  }
}

/** 403 that is not a rate limit: the token lacks the permission for this operation. */
export class GitHubPermissionError extends GitHubError {
  constructor(message = "The GitHub token does not have permission to do that.") {
    super(message, "forbidden", 403);
    this.name = "GitHubPermissionError";
  }
}

export class GitHubRateLimitError extends GitHubError {
  /** Epoch milliseconds at which the primary limit resets, if known. */
  readonly resetAt: number | null;
  /** Seconds GitHub asked us to wait (Retry-After), if provided. */
  readonly retryAfter: number | null;

  constructor(
    message: string,
    options: { resetAt?: number | null; retryAfter?: number | null; status?: number } = {},
  ) {
    super(message, "rate_limited", options.status ?? 403);
    this.name = "GitHubRateLimitError";
    this.resetAt = options.resetAt ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }

  /** Epoch ms when it is reasonable to try again. */
  retryAtMs(now: number): number {
    if (this.retryAfter !== null) return now + this.retryAfter * 1000;
    if (this.resetAt !== null) return Math.max(this.resetAt, now);
    return now + 60_000;
  }
}

/** 404. GitHub also answers 404 for private repositories the token cannot see. */
export class GitHubNotFoundError extends GitHubError {
  constructor(message = "Not found on GitHub (or the token cannot see it).") {
    super(message, "not_found", 404);
    this.name = "GitHubNotFoundError";
  }
}

/**
 * 409, or 422 for a non-fast-forward ref update. `code` is
 * "non_fast_forward" | "already_exists" | "empty_repository" | "conflict".
 */
export class GitHubConflictError extends GitHubError {
  constructor(message: string, code: string = "conflict", status = 409) {
    super(message, code, status);
    this.name = "GitHubConflictError";
  }

  get isNonFastForward(): boolean {
    return this.code === "non_fast_forward";
  }
}

/** fetch() itself failed: offline, DNS, CORS or a blocked request. */
export class GitHubNetworkError extends GitHubError {
  constructor(message = "Could not reach GitHub. Check your connection.") {
    super(message, "network");
    this.name = "GitHubNetworkError";
  }
}

/** Errors raised by the sync engine itself (limits, malformed state). */
export class GitHubSyncError extends GitHubError {
  constructor(message: string, code: GitHubSyncErrorCode) {
    super(message, code);
    this.name = "GitHubSyncError";
  }
}

export type GitHubSyncErrorCode =
  | "too_many_files"
  | "tree_truncated"
  | "invalid_path"
  | "missing_content"
  | "aborted"
  | "unstable_remote";
