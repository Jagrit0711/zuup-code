/**
 * SyncController: the framework-agnostic runtime of real-time GitHub sync.
 *
 *   const controller = new SyncController({ link, client, files });
 *   controller.on((event) => { ... });          // 'state' | 'remote-applied' | 'conflict' | 'pushed' | 'error'
 *   controller.start();
 *   editor.onChange(() => controller.setFiles(currentFiles()));
 *
 * Guarantees
 *  - Operations are serialized: at most one network cycle (and therefore one commit) is in flight.
 *  - Edits are coalesced: push after `debounceMs` of idleness, but never later than `maxWaitMs`
 *    after the first unpushed edit.
 *  - Remote changes are polled with conditional requests (an unchanged branch costs no rate limit),
 *    only while the tab is visible, plus immediately on focus and when the network returns.
 *  - Local edits are never overwritten: a path changed on both sides becomes a conflict
 *    that waits for resolveConflict().
 *  - A push that would delete most (or all) synced files is held until confirmDeletes() or
 *    restoreDeleted(): an empty or half-loaded project must never wipe the repository.
 */
import type { GitHubClient, RateLimitInfo } from "./client";
import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubNetworkError,
  GitHubNotFoundError,
  GitHubRateLimitError,
  GitHubSyncError,
} from "./errors";
import { type GitHubLink, saveLink } from "./link";
import { type LocalFile, type SkippedPath, joinRemotePath } from "./paths";
import { fetchRemoteSnapshot } from "./remote";
import {
  type AppliedChange,
  type Conflict,
  type MassDelete,
  type RemoteSnapshot,
  type Resolution,
  type ShaMap,
  type SyncPlan,
  ShaMemo,
  applyPull,
  applyShaUpdates,
  buildConflicts,
  computeBaseAfterConverge,
  detectMassDelete,
  computeBaseAfterPull,
  computeBaseAfterPush,
  excludeShas,
  formatCommitMessage,
  planSync,
  resolveConflict as resolveConflictPure,
  snapshotAfterPush,
} from "./sync";

export type SyncStatus =
  | "idle"
  | "pending"
  | "pushing"
  | "pulling"
  | "synced"
  | "conflict"
  | "held"
  | "offline"
  | "paused"
  | "error"
  | "unauthenticated";

export interface SyncState {
  status: SyncStatus;
  conflicts: Conflict[];
  /** Local paths with changes not yet in the repository. */
  pendingPaths: string[];
  /** Remote paths changed in the repository that are not applied locally (autoPull off or blocked). */
  remoteAheadPaths: string[];
  skipped: SkippedPath[];
  lastSyncAt: number | null;
  lastSyncedCommitSha: string | null;
  lastError: { code: string; message: string } | null;
  /** Epoch ms of the next automatic retry after a failure. */
  nextAttemptAt: number | null;
  /** Set (status "held") while a push that would delete many files waits for the user. */
  heldDeletes: MassDelete | null;
}

export type SyncEvent =
  | { type: "state"; state: SyncState; previous: SyncStatus }
  | { type: "remote-applied"; files: LocalFile[]; changes: AppliedChange[]; commitSha: string }
  | { type: "conflict"; conflicts: Conflict[] }
  | { type: "deletes-held"; paths: string[]; baseCount: number }
  | { type: "pushed"; commitSha: string; paths: string[]; message: string; url: string }
  | { type: "error"; code: string; message: string; error: Error; retryAt: number | null };

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface SyncControllerOptions {
  link: GitHubLink;
  client: GitHubClient;
  /** Current editor files (local paths relative to the synced root). */
  files?: LocalFile[];
  /**
   * Live source of the editor files. When given, the controller re-reads it right before every plan,
   * so an edit that has not reached setFiles() yet can never be overwritten by a pull.
   */
  getFiles?: () => LocalFile[];
  debounceMs?: number;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  isVisible?: () => boolean;
  isOnline?: () => boolean;
  /** Defaults to `window` / `document` in a browser, nothing on the server. */
  windowTarget?: EventTargetLike | null;
  documentTarget?: EventTargetLike | null;
  /** Called whenever the link (base snapshot etc.) changes. Defaults to saving to localStorage. */
  persistLink?: (link: GitHubLink) => void;
  now?: () => number;
  random?: () => number;
}

export interface CycleSummary {
  /** false when the cycle was skipped (paused, blocked, disposed) or failed. */
  ok: boolean;
  pushed: string[];
  applied: AppliedChange[];
  conflicts: number;
  commitSha: string | null;
  error: Error | null;
}

interface CycleMode {
  push: boolean;
  pull: boolean;
}

export const DEFAULT_DEBOUNCE_MS = 2500;
export const DEFAULT_MAX_WAIT_MS = 20_000;
export const DEFAULT_POLL_INTERVAL_MS = 20_000;
const DEFAULT_MAX_BACKOFF_MS = 300_000;
const MIN_POLL_GAP_MS = 2000;
const MAX_CYCLE_ATTEMPTS = 4;

class DisposedSignal extends Error {}

const emptySummary = (error: Error | null = null): CycleSummary => ({
  ok: false,
  pushed: [],
  applied: [],
  conflicts: 0,
  commitSha: null,
  error,
});

export class SyncController {
  private link: GitHubLink;
  private readonly client: GitHubClient;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxBackoffMs: number;
  private readonly isVisibleFn: () => boolean;
  private readonly isOnlineFn: () => boolean;
  private readonly persist: (link: GitHubLink) => void;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly windowTargetOpt: EventTargetLike | null | undefined;
  private readonly documentTargetOpt: EventTargetLike | null | undefined;

  private files: LocalFile[];
  private current = new Map<string, string>();
  private touched = new Set<string>();
  private readonly memo = new ShaMemo();
  private base: ShaMap;
  private remote: RemoteSnapshot | null = null;
  private binaryShas = new Set<string>();
  private lastPlan: SyncPlan | null = null;
  private conflicts = new Map<string, Conflict>();
  private conflictSignature = "";
  private readonly getFilesFn: (() => LocalFile[]) | null;
  private heldDeletes: MassDelete | null = null;
  private heldSignature = "";
  /** Deletions the user confirmed; a held push whose paths are all in here may proceed. */
  private allowedDeletes = new Set<string>();

  private state: SyncState;
  private eventListeners = new Set<(event: SyncEvent) => void>();
  private stateListeners = new Set<() => void>();

  private chain: Promise<void> = Promise.resolve();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt: number | null = null;
  private flushQueued = false;
  private pollQueued = false;
  private lastPollAt = 0;
  private failures = 0;
  private blockedUntil = 0;

  private started = false;
  private paused = false;
  private authFailed = false;
  private disposed = false;
  private attached: Array<[EventTargetLike, string, () => void]> = [];

  constructor(options: SyncControllerOptions) {
    this.link = options.link;
    this.client = options.client;
    this.getFilesFn = options.getFiles ?? null;
    this.files = options.files ?? options.getFiles?.() ?? [];
    for (const f of this.files) this.current.set(f.path, f.content);
    this.base = { ...options.link.baseTree };
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.isVisibleFn =
      options.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
    this.isOnlineFn = options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.persist = options.persistLink ?? ((l) => void saveLink(l));
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.windowTargetOpt = options.windowTarget;
    this.documentTargetOpt = options.documentTarget;
    this.state = {
      status: "idle",
      conflicts: [],
      pendingPaths: [],
      remoteAheadPaths: [],
      skipped: [],
      lastSyncAt: this.link.lastSyncAt,
      lastSyncedCommitSha: this.link.lastSyncedCommitSha,
      lastError: null,
      nextAttemptAt: null,
      heldDeletes: null,
    };
  }

  // ------------------------------------------------------------ public API

  getState(): SyncState {
    return this.state;
  }

  getLink(): GitHubLink {
    return this.link;
  }

  getFiles(): LocalFile[] {
    return this.files;
  }

  getRateLimit(): RateLimitInfo | null {
    return this.client.getRateLimit();
  }

  /** Subscribes to every event. Returns an unsubscribe function. */
  on(handler: (event: SyncEvent) => void): () => void {
    this.eventListeners.add(handler);
    return () => this.eventListeners.delete(handler);
  }

  /** useSyncExternalStore-compatible: pair with getState(). */
  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Begins polling and runs the first sync. Safe to call once. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.attachListeners();
    void this.execute({ push: this.link.autoPush, pull: this.link.autoPull }, false);
  }

  /** Call on every editor change with the project's current files. */
  setFiles(files: LocalFile[]): void {
    if (this.disposed) return;
    if (this.ingest(files).length === 0) return;
    if (this.state.status === "idle" || this.state.status === "synced") this.setState({ status: "pending", pendingPaths: this.pendingPaths() });
    this.scheduleFlush();
  }

  /**
   * Pushes a held mass deletion (status "held") after the user confirmed it.
   * Any other push that later looks like a mass deletion is held again.
   */
  confirmDeletes(): Promise<CycleSummary> {
    if (this.disposed || !this.heldDeletes) return Promise.resolve(emptySummary());
    this.allowedDeletes = new Set(this.heldDeletes.paths);
    this.clearFlushTimer();
    return this.execute({ push: true, pull: this.link.autoPull }, true);
  }

  /**
   * Discards a held mass deletion by bringing the deleted files back from the repository
   * (announced as a 'remote-applied' event, like a pull). Files created locally are kept.
   */
  restoreDeleted(): Promise<CycleSummary> {
    return this.enqueue(async () => {
      const held = this.heldDeletes;
      if (this.disposed || !held) return emptySummary();
      const { owner, repo } = this.link;
      const shaOf = (path: string) => this.remote?.files[path] ?? this.base[path];
      try {
        const fetched = await this.client.getBlobsBatch(owner, repo, held.paths.map(shaOf).filter(Boolean));
        this.live();
        this.refreshFromSource();
        const present = new Set(this.files.map((f) => f.path));
        const restored: LocalFile[] = [];
        for (const path of held.paths) {
          const content = fetched.get(shaOf(path))?.content;
          if (!present.has(path) && typeof content === "string") restored.push({ path, content });
        }
        const files = [...this.files, ...restored];
        this.replaceFiles(files);
        this.clearHeldDeletes();
        const changes: AppliedChange[] = restored.map((f) => ({ path: f.path, kind: "added" }));
        if (changes.length > 0) {
          this.emit({
            type: "remote-applied",
            files,
            changes,
            commitSha: this.remote?.commitSha ?? this.link.lastSyncedCommitSha ?? "",
          });
        }
        this.refreshPlan();
        this.settle();
        if (this.link.autoPush && this.hasPendingPush()) this.scheduleFlush();
        return { ...emptySummary(), ok: true, applied: changes };
      } catch (error) {
        if (error instanceof DisposedSignal) return emptySummary();
        return this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Push local changes now (explicit user action; also works while paused). */
  pushNow(): Promise<CycleSummary> {
    this.clearFlushTimer();
    return this.execute({ push: true, pull: false }, true);
  }

  /** Pull remote changes now (never pushes). */
  pullNow(): Promise<CycleSummary> {
    return this.execute({ push: false, pull: true }, true);
  }

  /** Pull, then push: a full two-way sync. */
  syncNow(): Promise<CycleSummary> {
    this.clearFlushTimer();
    return this.execute({ push: true, pull: true }, true);
  }

  pause(): void {
    if (this.disposed || this.paused) return;
    this.paused = true;
    this.clearFlushTimer();
    this.clearPollTimer();
    this.setState({ status: "paused" });
  }

  /** Leaves pause / unauthenticated / error states and syncs immediately. Call after signing in again. */
  resume(): Promise<CycleSummary> {
    if (this.disposed) return Promise.resolve(emptySummary());
    this.paused = false;
    this.authFailed = false;
    this.failures = 0;
    this.blockedUntil = 0;
    this.settle();
    return this.execute({ push: this.link.autoPush, pull: this.link.autoPull }, true);
  }

  /** Changes automation settings of the link (not the repository/branch). */
  updateLink(patch: Partial<Pick<GitHubLink, "autoPush" | "autoPull" | "commitMessageTemplate">>): void {
    if (this.disposed) return;
    this.link = { ...this.link, ...patch };
    this.persist(this.link);
    if (patch.autoPush === false) this.clearFlushTimer();
    if (patch.autoPush === true && this.hasPendingPush()) this.scheduleFlush();
  }

  /**
   * Resolves a conflict by keeping the local version, taking the remote version, or supplying merged
   * content. Returns false when there is no such conflict.
   */
  resolveConflict(path: string, choice: Resolution): boolean {
    const conflict = this.conflicts.get(path);
    if (!conflict || this.disposed) return false;
    const resolution = resolveConflictPure(conflict, choice);
    if (resolution.fileChange) {
      const { path: changedPath, content } = resolution.fileChange;
      const files = this.files.filter((f) => f.path !== changedPath);
      if (content !== null) files.push({ path: changedPath, content });
      const existed = this.files.some((f) => f.path === changedPath);
      this.replaceFiles(files);
      this.emit({
        type: "remote-applied",
        files,
        changes: [{ path: changedPath, kind: content === null ? "deleted" : existed ? "modified" : "added" }],
        commitSha: this.remote?.commitSha ?? this.link.lastSyncedCommitSha ?? "",
      });
    }
    this.base = applyShaUpdates(this.base, [resolution.baseUpdate]);
    this.conflicts.delete(path);
    this.conflictSignature = this.signature(Array.from(this.conflicts.values()));
    this.refreshPlan();
    this.persistLink();
    this.settle();
    if (this.link.autoPush && this.hasPendingPush()) this.scheduleFlush();
    return true;
  }

  /** Resolves when every queued operation has finished (handy for tests and "save before leaving"). */
  async idle(): Promise<void> {
    let current: Promise<void>;
    do {
      current = this.chain;
      await current;
    } while (current !== this.chain);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearFlushTimer();
    this.clearPollTimer();
    for (const [target, type, listener] of this.attached) target.removeEventListener(type, listener);
    this.attached = [];
    this.eventListeners.clear();
    this.stateListeners.clear();
  }

  // ------------------------------------------------------------- scheduling

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private canAutomate(): boolean {
    return this.started && !this.paused && !this.authFailed && !this.disposed;
  }

  private scheduleFlush(): void {
    if (!this.link.autoPush || !this.canAutomate()) return;
    const now = this.now();
    if (this.firstDirtyAt === null) this.firstDirtyAt = now;
    const remainingMaxWait = this.maxWaitMs - (now - this.firstDirtyAt);
    const delay = Math.max(0, Math.min(this.debounceMs, remainingMaxWait));
    this.clearFlushTimer();
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, delay);
  }

  private flush(): void {
    if (this.flushQueued || !this.canAutomate()) return;
    this.flushQueued = true;
    void this.execute({ push: true, pull: this.link.autoPull }, false, () => {
      this.flushQueued = false;
      this.firstDirtyAt = null;
    });
  }

  private schedulePoll(delay: number = this.pollIntervalMs): void {
    this.clearPollTimer();
    if (!this.canAutomate()) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      if (!this.isVisibleFn()) {
        this.schedulePoll();
        return;
      }
      this.poll();
    }, Math.max(0, delay));
  }

  private poll(): void {
    if (this.pollQueued || !this.canAutomate()) return;
    this.pollQueued = true;
    const push = this.link.autoPush && this.flushTimer === null && this.hasPendingPush();
    void this.execute({ push, pull: this.link.autoPull }, false, () => {
      this.pollQueued = false;
      this.lastPollAt = this.now();
    });
  }

  private pollSoon(): void {
    if (!this.canAutomate() || !this.isVisibleFn()) return;
    if (this.now() - this.lastPollAt < MIN_POLL_GAP_MS) return;
    this.poll();
  }

  private attachListeners(): void {
    const win = this.windowTargetOpt !== undefined ? this.windowTargetOpt : typeof window !== "undefined" ? window : null;
    const doc = this.documentTargetOpt !== undefined ? this.documentTargetOpt : typeof document !== "undefined" ? document : null;
    const add = (target: EventTargetLike | null, type: string, listener: () => void) => {
      if (!target) return;
      target.addEventListener(type, listener);
      this.attached.push([target, type, listener]);
    };
    add(win, "focus", () => this.pollSoon());
    add(win, "online", () => {
      this.blockedUntil = 0;
      this.failures = 0;
      this.lastPollAt = 0;
      if (this.state.status === "offline") this.setState({ status: this.baseStatus() });
      this.pollSoon();
    });
    add(win, "offline", () => {
      if (!this.canAutomate()) return;
      this.setState({ status: "offline" });
    });
    add(doc, "visibilitychange", () => this.pollSoon());
  }

  // ------------------------------------------------------------- execution

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private execute(mode: CycleMode, manual: boolean, onStart?: () => void): Promise<CycleSummary> {
    return this.enqueue(async () => {
      onStart?.();
      if (this.disposed) return emptySummary();
      if (!manual && (this.paused || this.authFailed)) return emptySummary();
      const wait = this.blockedUntil - this.now();
      if (!manual && wait > 0) {
        this.schedulePoll(wait);
        return emptySummary();
      }
      if (!this.isOnlineFn()) {
        return this.fail(new GitHubNetworkError("You are offline."));
      }
      try {
        const summary = await this.cycle(mode);
        this.onSuccess();
        return summary;
      } catch (error) {
        if (error instanceof DisposedSignal) return emptySummary();
        return this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private live(): void {
    if (this.disposed) throw new DisposedSignal();
  }

  private onSuccess(): void {
    this.failures = 0;
    this.blockedUntil = 0;
    this.authFailed = false;
    const at = this.now();
    this.link = { ...this.link, lastSyncAt: at };
    this.setState({ lastError: null, nextAttemptAt: null, lastSyncAt: at });
    this.settle();
    this.schedulePoll();
    if (this.link.autoPush && this.flushTimer === null && this.hasPendingPush() && this.state.status === "pending") {
      this.scheduleFlush();
    }
  }

  private fail(error: Error): CycleSummary {
    if (this.disposed) return emptySummary(error);
    const code = (error as { code?: string }).code ?? "unknown";
    let status: SyncStatus = "error";
    let retryAt: number | null = null;
    const now = this.now();
    if (error instanceof GitHubAuthError) {
      status = "unauthenticated";
      this.authFailed = true;
      this.clearFlushTimer();
      this.clearPollTimer();
    } else {
      this.failures++;
      let delay: number;
      if (error instanceof GitHubRateLimitError) {
        retryAt = error.retryAtMs(now) + Math.floor(this.random() * 1000);
        this.blockedUntil = retryAt;
        delay = retryAt - now;
      } else {
        status = error instanceof GitHubNetworkError || !this.isOnlineFn() ? "offline" : "error";
        delay = Math.min(this.maxBackoffMs, this.pollIntervalMs * 2 ** (this.failures - 1)) * (1 + this.random() * 0.25);
        retryAt = now + delay;
      }
      this.schedulePoll(delay);
    }
    this.setState({
      status: this.paused ? "paused" : status,
      lastError: { code, message: error.message },
      nextAttemptAt: retryAt,
    });
    this.emit({ type: "error", code, message: error.message, error, retryAt });
    return emptySummary(error);
  }

  // ----------------------------------------------------------------- cycle

  private plan(): SyncPlan {
    if (!this.remote) throw new GitHubSyncError("No remote snapshot yet.", "missing_content");
    this.refreshFromSource();
    return planSync({ local: this.files, base: this.base, remote: this.remote, memo: this.memo });
  }

  private refreshPlan(): void {
    if (!this.remote) return;
    try {
      this.lastPlan = this.plan();
    } catch {
      // surfaced by the next cycle
    }
  }

  private async cycle(initialMode: CycleMode): Promise<CycleSummary> {
    const { owner, repo, branch, subdir } = this.link;
    const mode = { ...initialMode };
    const summary: CycleSummary = { ok: true, pushed: [], applied: [], conflicts: 0, commitSha: null, error: null };

    for (let attempt = 0; attempt < MAX_CYCLE_ATTEMPTS; attempt++) {
      const ref = await this.client.getBranchRef(owner, repo, branch);
      this.live();
      const headSha = ref.sha ?? this.remote?.commitSha ?? null;
      if (!headSha) throw new GitHubNotFoundError(`Branch "${branch}" was not found.`);

      if (!this.remote || this.remote.commitSha !== headSha) {
        if (mode.pull && this.isCalm()) this.setState({ status: "pulling" });
        this.remote = await fetchRemoteSnapshot(this.client, {
          owner,
          repo,
          commitSha: headSha,
          subdir,
          knownUnsyncable: this.binaryShas,
        });
        this.live();
      }

      // Resolve everything the plan needs from the network, replanning until it is stable.
      const blobs = new Map<string, string | null>();
      let plan = this.plan();
      for (let round = 0; ; round++) {
        const need = this.missingBlobs(plan, mode, blobs);
        if (need.remote.length === 0 && need.base.length === 0) break;
        if (round >= 4) throw new GitHubSyncError("The remote files kept changing during sync. Try again.", "unstable_remote");
        const fetched = await this.client.getBlobsBatch(owner, repo, [...need.remote, ...need.base]);
        this.live();
        let excluded = false;
        for (const sha of need.remote) {
          const content = fetched.get(sha)?.content ?? null;
          blobs.set(sha, content);
          if (content === null) {
            this.binaryShas.add(sha);
            excluded = true;
          }
        }
        for (const sha of need.base) blobs.set(sha, fetched.get(sha)?.content ?? null);
        if (excluded && this.remote) this.remote = excludeShas(this.remote, this.binaryShas);
        plan = this.plan();
      }

      // From here to the end of the pull step there is no await: the plan matches the live files.
      let baseChanged = false;
      if (mode.pull && plan.pull.length > 0) {
        const contents: Record<string, string> = {};
        for (const change of plan.pull) {
          if (change.sha !== null) contents[change.path] = blobs.get(change.sha) as string;
        }
        const applied = applyPull(this.files, plan.pull, contents);
        this.replaceFiles(applied.files);
        this.base = computeBaseAfterPull(this.base, plan);
        summary.applied.push(...applied.changes);
        baseChanged = true;
        this.emit({ type: "remote-applied", files: applied.files, changes: applied.changes, commitSha: plan.remoteCommitSha });
      } else if (plan.converged.length > 0) {
        this.base = computeBaseAfterConverge(this.base, plan);
        baseChanged = true;
      }

      const remoteContents: Record<string, string | null> = {};
      const baseContents: Record<string, string | null> = {};
      for (const c of plan.conflicts) {
        if (c.remoteSha !== null) remoteContents[c.path] = blobs.get(c.remoteSha) ?? null;
        if (c.baseSha !== null) baseContents[c.path] = blobs.get(c.baseSha) ?? null;
      }
      this.setConflicts(buildConflicts(plan.conflicts, this.files, remoteContents, baseContents));
      summary.conflicts = plan.conflicts.length;

      // Hold a push that would delete many synced files until the user confirms or restores.
      let holdPush = false;
      if (mode.push) {
        const mass = detectMassDelete(plan.push, this.base);
        if (mass && !mass.paths.every((path) => this.allowedDeletes.has(path))) {
          holdPush = true;
          this.holdDeletes(mass);
        } else if (this.heldDeletes) {
          this.clearHeldDeletes();
        }
      }

      if (mode.push && plan.push.length > 0 && !holdPush) {
        const remote = this.remote as RemoteSnapshot;
        const paths = plan.push.map((c) => c.path);
        const message = formatCommitMessage(this.link.commitMessageTemplate, paths);
        this.setState({ status: "pushing" });
        let result;
        try {
          result = await this.client.commitChanges({
            owner,
            repo,
            branch,
            baseCommitSha: remote.commitSha,
            baseTreeSha: remote.treeSha,
            message,
            changes: plan.push.map((c) => ({
              path: joinRemotePath(subdir, c.path),
              content: c.content,
              mode: remote.modes[c.path],
            })),
          });
        } catch (error) {
          if (error instanceof GitHubConflictError && error.isNonFastForward && attempt < MAX_CYCLE_ATTEMPTS - 1) {
            // The branch moved under us: forget the snapshot, re-read, re-plan, try again.
            this.remote = null;
            if (baseChanged) this.persistLink();
            continue;
          }
          throw error;
        }
        this.live();
        this.base = computeBaseAfterPush(this.base, plan.push);
        this.remote = snapshotAfterPush(remote, plan.push, result.commitSha, result.treeSha);
        baseChanged = true;
        summary.pushed = paths;
        summary.commitSha = result.commitSha;
        this.allowedDeletes.clear();
        this.emit({ type: "pushed", commitSha: result.commitSha, paths, message, url: result.url });
      }

      this.touched.clear();
      this.refreshPlan();
      const reconciled = this.lastPlan !== null && this.lastPlan.pull.length === 0 && this.conflicts.size === 0;
      const lastSyncedCommitSha = reconciled && this.remote ? this.remote.commitSha : this.link.lastSyncedCommitSha;
      const shaChanged = lastSyncedCommitSha !== this.link.lastSyncedCommitSha;
      this.link = { ...this.link, baseTree: this.base, lastSyncedCommitSha };
      // Idle polls change nothing, so they never touch localStorage.
      if (baseChanged || shaChanged) this.persist(this.link);
      return summary;
    }
    throw new GitHubConflictError("The branch kept changing while pushing. Try again in a moment.", "non_fast_forward", 422);
  }

  private missingBlobs(plan: SyncPlan, mode: CycleMode, have: Map<string, string | null>): { remote: string[]; base: string[] } {
    const remote = new Set<string>();
    const base = new Set<string>();
    if (mode.pull) {
      for (const c of plan.pull) if (c.sha !== null && !have.has(c.sha)) remote.add(c.sha);
    }
    for (const c of plan.conflicts) {
      if (c.remoteSha !== null && !have.has(c.remoteSha)) remote.add(c.remoteSha);
      if (c.baseSha !== null && !have.has(c.baseSha)) base.add(c.baseSha);
    }
    return { remote: Array.from(remote), base: Array.from(base).filter((s) => !remote.has(s)) };
  }

  // ----------------------------------------------------------------- state

  /** Updates the local view; returns the paths whose content changed (they count as touched). */
  private ingest(files: LocalFile[]): string[] {
    const next = new Map<string, string>();
    const changed: string[] = [];
    for (const f of files) {
      next.set(f.path, f.content);
      if (this.current.get(f.path) !== f.content) changed.push(f.path);
    }
    for (const path of this.current.keys()) if (!next.has(path)) changed.push(path);
    this.files = files;
    this.current = next;
    for (const path of changed) this.touched.add(path);
    return changed;
  }

  private refreshFromSource(): void {
    if (!this.getFilesFn || this.disposed) return;
    try {
      this.ingest(this.getFilesFn());
    } catch {
      // a faulty source must not break syncing; keep the last known files
    }
  }

  private holdDeletes(mass: MassDelete): void {
    this.heldDeletes = mass;
    const signature = mass.paths.join("\n");
    if (signature === this.heldSignature) return;
    this.heldSignature = signature;
    this.emit({ type: "deletes-held", paths: mass.paths, baseCount: mass.baseCount });
  }

  private clearHeldDeletes(): void {
    this.heldDeletes = null;
    this.heldSignature = "";
    this.allowedDeletes.clear();
  }

  private replaceFiles(files: LocalFile[]): void {
    this.files = files;
    this.current = new Map(files.map((f) => [f.path, f.content] as const));
    this.memo.retain(this.current.keys());
  }

  private persistLink(): void {
    this.link = { ...this.link, baseTree: this.base };
    this.persist(this.link);
  }

  private signature(conflicts: Conflict[]): string {
    return conflicts
      .map((c) => `${c.path}|${c.localSha}|${c.remoteSha}`)
      .sort()
      .join(";");
  }

  private setConflicts(conflicts: Conflict[]): void {
    this.conflicts = new Map(conflicts.map((c) => [c.path, c] as const));
    const signature = this.signature(conflicts);
    const changed = signature !== this.conflictSignature;
    this.conflictSignature = signature;
    this.state = { ...this.state, conflicts };
    if (changed && conflicts.length > 0) this.emit({ type: "conflict", conflicts });
  }

  private hasPendingPush(): boolean {
    return this.touched.size > 0 || (this.lastPlan?.push.length ?? 0) > 0;
  }

  private pendingPaths(): string[] {
    const set = new Set<string>(this.touched);
    for (const c of this.lastPlan?.push ?? []) set.add(c.path);
    return Array.from(set).sort();
  }

  private isCalm(): boolean {
    const s = this.state.status;
    return s === "idle" || s === "synced" || s === "pending" || s === "conflict" || s === "held";
  }

  private baseStatus(): SyncStatus {
    if (this.paused) return "paused";
    if (this.heldDeletes) return "held";
    if (this.conflicts.size > 0) return "conflict";
    return this.hasPendingPush() ? "pending" : "synced";
  }

  /** Recomputes the resting status after a successful operation. */
  private settle(): void {
    this.setState({ status: this.baseStatus() });
  }

  private setState(patch: Partial<SyncState>): void {
    const previous = this.state.status;
    const plan = this.lastPlan;
    this.state = {
      ...this.state,
      pendingPaths: this.pendingPaths(),
      remoteAheadPaths: plan ? plan.pull.map((c) => c.path) : [],
      skipped: plan ? plan.skipped : this.state.skipped,
      lastSyncedCommitSha: this.link.lastSyncedCommitSha,
      heldDeletes: this.heldDeletes,
      ...patch,
    };
    this.emit({ type: "state", state: this.state, previous });
    for (const listener of Array.from(this.stateListeners)) listener();
  }

  private emit(event: SyncEvent): void {
    for (const handler of Array.from(this.eventListeners)) {
      try {
        handler(event);
      } catch {
        // a faulty subscriber must not break syncing
      }
    }
  }
}
