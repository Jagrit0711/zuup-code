/**
 * Pure three-way sync engine. No I/O, no timers, no globals: everything here is
 * deterministic and unit-tested. The controller feeds it data and applies its plans.
 *
 * Vocabulary
 *   local  - the files currently in the editor
 *   base   - the remote snapshot we last synced (path -> git blob sha)
 *   remote - the latest remote snapshot (path -> git blob sha)
 * All paths are in "local space" (the optional sub-folder prefix is already stripped).
 */
import { GitHubSyncError } from "./errors";
import {
  type LocalFile,
  type SkippedPath,
  ignoreReasonForPath,
  prepareLocalFiles,
  toLocalPath,
  MAX_FILE_BYTES,
} from "./paths";
import { gitBlobSha } from "./sha";

export type ShaMap = Record<string, string>;

export interface RemoteSnapshot {
  commitSha: string;
  treeSha: string;
  /** Syncable remote files: local-space path -> blob sha. */
  files: ShaMap;
  /** Tree entry modes (e.g. 100755) so executable bits survive edits. */
  modes: Record<string, string>;
  /** Remote paths we must not touch (binary, too large, symlinks...). */
  skipped: string[];
}

export interface TreeEntryLike {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

/** Caches blob shas per path so unchanged files are never re-hashed on every edit. */
export class ShaMemo {
  private entries = new Map<string, { content: string; sha: string }>();

  sha(path: string, content: string): string {
    const hit = this.entries.get(path);
    if (hit && hit.content === content) return hit.sha;
    const sha = gitBlobSha(content);
    this.entries.set(path, { content, sha });
    return sha;
  }

  /** Drops entries for paths that no longer exist. */
  retain(paths: Iterable<string>): void {
    const keep = new Set(paths);
    for (const key of Array.from(this.entries.keys())) if (!keep.has(key)) this.entries.delete(key);
  }
}

export function hashFiles(files: LocalFile[], memo: ShaMemo = new ShaMemo()): ShaMap {
  const out: ShaMap = {};
  for (const f of files) out[f.path] = memo.sha(f.path, f.content);
  return out;
}

// ---------------------------------------------------------------- snapshots

/**
 * Converts a recursive git tree into a snapshot, honouring the sub-folder and
 * ignore rules. Blob shas listed in `knownUnsyncable` (binary content found
 * earlier) are moved to `skipped`.
 */
export function buildRemoteSnapshot(input: {
  commitSha: string;
  treeSha: string;
  entries: TreeEntryLike[];
  subdir: string;
  knownUnsyncable?: ReadonlySet<string>;
}): RemoteSnapshot {
  const files: ShaMap = {};
  const modes: Record<string, string> = {};
  const skipped: string[] = [];
  for (const entry of input.entries) {
    if (entry.type === "tree") continue;
    const local = toLocalPath(input.subdir, entry.path);
    if (local === null) continue;
    if (entry.type !== "blob" || entry.mode === "120000") {
      skipped.push(local); // submodules and symlinks
      continue;
    }
    if (ignoreReasonForPath(local)) continue;
    if ((entry.size ?? 0) > MAX_FILE_BYTES || input.knownUnsyncable?.has(entry.sha)) {
      skipped.push(local);
      continue;
    }
    files[local] = entry.sha;
    modes[local] = entry.mode;
  }
  skipped.sort();
  return { commitSha: input.commitSha, treeSha: input.treeSha, files, modes, skipped };
}

/** Returns a copy of the snapshot with the given blob shas moved to `skipped`. */
export function excludeShas(snapshot: RemoteSnapshot, shas: ReadonlySet<string>): RemoteSnapshot {
  const files: ShaMap = {};
  const modes: Record<string, string> = {};
  const skipped = [...snapshot.skipped];
  for (const [path, sha] of Object.entries(snapshot.files)) {
    if (shas.has(sha)) {
      skipped.push(path);
    } else {
      files[path] = sha;
      if (snapshot.modes[path]) modes[path] = snapshot.modes[path];
    }
  }
  skipped.sort();
  return { ...snapshot, files, modes, skipped };
}

// ----------------------------------------------------------- classification

export type ChangeKind =
  | "unchanged"
  | "local-added"
  | "local-modified"
  | "local-deleted"
  | "remote-added"
  | "remote-modified"
  | "remote-deleted"
  | "converged"
  | "conflict";

export type ConflictKind = "modify-modify" | "add-add" | "modify-delete" | "delete-modify";

/**
 * Classifies one path from its local/base/remote blob shas (undefined = absent).
 * A rename is simply a delete plus an add, so it needs no special case.
 */
export function classifyPath(
  local: string | undefined,
  base: string | undefined,
  remote: string | undefined,
): ChangeKind {
  if (local === remote) return local === base ? "unchanged" : "converged";
  if (local === base) {
    if (base === undefined) return "remote-added";
    return remote === undefined ? "remote-deleted" : "remote-modified";
  }
  if (remote === base) {
    if (base === undefined) return "local-added";
    return local === undefined ? "local-deleted" : "local-modified";
  }
  return "conflict";
}

export function conflictKindOf(
  local: string | undefined,
  base: string | undefined,
  remote: string | undefined,
): ConflictKind {
  if (local === undefined) return "delete-modify";
  if (remote === undefined) return "modify-delete";
  return base === undefined ? "add-add" : "modify-modify";
}

// -------------------------------------------------------------------- plans

export interface PushChange {
  path: string;
  /** null = delete the file in the repository. */
  content: string | null;
  sha: string | null;
  kind: "add" | "modify" | "delete";
}

export interface PullChange {
  path: string;
  /** Remote blob sha (null for deletions). Content must be fetched for add/modify. */
  sha: string | null;
  kind: "add" | "modify" | "delete";
}

export interface ConflictRef {
  path: string;
  kind: ConflictKind;
  localSha: string | null;
  baseSha: string | null;
  remoteSha: string | null;
}

export interface PathState {
  path: string;
  kind: ChangeKind;
  localSha: string | null;
  baseSha: string | null;
  remoteSha: string | null;
}

/** Thresholds for treating a push as a suspicious mass deletion. */
export const MASS_DELETE_MIN_FILES = 5;
export const MASS_DELETE_MIN_RATIO = 0.5;

export interface MassDelete {
  /** Paths the push would delete in the repository. */
  paths: string[];
  /** Number of files in the last synced snapshot. */
  baseCount: number;
}

/**
 * A push that would delete many of the synced files, or every one of them, is far more likely to be a
 * project that failed to load (cleared storage, a partial cloud load) than an intentional clean-up.
 * Returns the deletion so the caller can ask for confirmation, or null when the push looks normal.
 */
export function detectMassDelete(push: Pick<PushChange, "path" | "kind">[], base: ShaMap): MassDelete | null {
  const baseCount = Object.keys(base).length;
  if (baseCount === 0) return null;
  const paths = push.filter((c) => c.kind === "delete" && c.path in base).map((c) => c.path).sort();
  if (paths.length === 0) return null;
  const many = paths.length >= MASS_DELETE_MIN_FILES && paths.length >= baseCount * MASS_DELETE_MIN_RATIO;
  const everything = paths.length === baseCount;
  return many || everything ? { paths, baseCount } : null;
}

export interface SyncPlan {
  remoteCommitSha: string;
  /** Every path that is not "unchanged". */
  entries: PathState[];
  push: PushChange[];
  pull: PullChange[];
  conflicts: ConflictRef[];
  /** Paths where both sides already agree; only the base needs updating. */
  converged: PathState[];
  skipped: SkippedPath[];
  /** Nothing local changed, the remote did: a plain fast-forward. */
  fastForward: boolean;
  inSync: boolean;
}

export interface PlanInput {
  local: LocalFile[];
  base: ShaMap;
  remote: RemoteSnapshot;
  memo?: ShaMemo;
  maxFiles?: number;
}

export function planSync(input: PlanInput): SyncPlan {
  const memo = input.memo ?? new ShaMemo();
  const prepared = prepareLocalFiles(input.local, input.maxFiles);
  const localMap = new Map<string, LocalFile>();
  for (const f of prepared.files) localMap.set(f.path, f);

  const skipped: SkippedPath[] = [...prepared.skipped];
  const protectedRemote = new Set(input.remote.skipped);
  // A local file that is currently unsyncable (e.g. grew past 1 MB) must never be read
  // as "deleted locally", so such paths are left out of the classification entirely.
  const locallySkipped = new Set(prepared.skipped.map((s) => s.path));
  for (const path of Array.from(localMap.keys())) {
    if (protectedRemote.has(path)) localMap.delete(path);
  }
  for (const path of input.remote.skipped) skipped.push({ path, reason: "remote-unsyncable" });

  const localSha: ShaMap = {};
  for (const [path, f] of localMap) localSha[path] = memo.sha(path, f.content);

  const paths = new Set<string>([
    ...Object.keys(localSha),
    ...Object.keys(input.base),
    ...Object.keys(input.remote.files),
  ]);

  const entries: PathState[] = [];
  const push: PushChange[] = [];
  const pull: PullChange[] = [];
  const conflicts: ConflictRef[] = [];
  const converged: PathState[] = [];

  for (const path of Array.from(paths).sort()) {
    if (protectedRemote.has(path)) continue;
    if (!localMap.has(path) && locallySkipped.has(path)) continue;
    const l = localSha[path];
    const b = input.base[path];
    const r = input.remote.files[path];
    const kind = classifyPath(l, b, r);
    if (kind === "unchanged") continue;
    const state: PathState = { path, kind, localSha: l ?? null, baseSha: b ?? null, remoteSha: r ?? null };
    entries.push(state);
    switch (kind) {
      case "local-added":
      case "local-modified":
        push.push({
          path,
          content: localMap.get(path)!.content,
          sha: l,
          kind: kind === "local-added" ? "add" : "modify",
        });
        break;
      case "local-deleted":
        push.push({ path, content: null, sha: null, kind: "delete" });
        break;
      case "remote-added":
      case "remote-modified":
        pull.push({ path, sha: r, kind: kind === "remote-added" ? "add" : "modify" });
        break;
      case "remote-deleted":
        pull.push({ path, sha: null, kind: "delete" });
        break;
      case "converged":
        converged.push(state);
        break;
      case "conflict":
        conflicts.push({
          path,
          kind: conflictKindOf(l, b, r),
          localSha: l ?? null,
          baseSha: b ?? null,
          remoteSha: r ?? null,
        });
        break;
    }
  }

  return {
    remoteCommitSha: input.remote.commitSha,
    entries,
    push,
    pull,
    conflicts,
    converged,
    skipped,
    fastForward: push.length === 0 && conflicts.length === 0 && pull.length > 0,
    inSync: push.length === 0 && pull.length === 0 && conflicts.length === 0,
  };
}

/** Push-side view of a plan: remote-only changes are left untouched (never applied). */
export function planPush(input: PlanInput): SyncPlan {
  return { ...planSync(input), pull: [], fastForward: false };
}

/** Pull-side view of a plan: local-only changes are left untouched (never pushed). */
export function planPull(input: PlanInput): SyncPlan {
  const plan = planSync(input);
  return { ...plan, push: [], fastForward: plan.pull.length > 0 && plan.conflicts.length === 0 && plan.push.length === 0 };
}

// ---------------------------------------------------------------- applying

export interface AppliedChange {
  path: string;
  kind: "added" | "modified" | "deleted";
}

/**
 * Applies pull changes to a copy of the local files. Throws rather than
 * silently dropping a change when content is missing.
 */
export function applyPull(
  local: LocalFile[],
  pull: PullChange[],
  contents: Record<string, string>,
): { files: LocalFile[]; changes: AppliedChange[] } {
  const byPath = new Map<string, LocalFile>();
  for (const f of local) byPath.set(f.path, f);
  const changes: AppliedChange[] = [];
  for (const change of pull) {
    if (change.kind === "delete") {
      if (byPath.delete(change.path)) changes.push({ path: change.path, kind: "deleted" });
      continue;
    }
    const content = contents[change.path];
    if (typeof content !== "string") {
      throw new GitHubSyncError(`Missing remote content for ${change.path}.`, "missing_content");
    }
    byPath.set(change.path, { path: change.path, content });
    changes.push({ path: change.path, kind: change.kind === "add" ? "added" : "modified" });
  }
  return { files: Array.from(byPath.values()), changes };
}

export interface ShaUpdate {
  path: string;
  /** null removes the path from the base. */
  sha: string | null;
}

export function applyShaUpdates(base: ShaMap, updates: ShaUpdate[]): ShaMap {
  const next: ShaMap = { ...base };
  for (const u of updates) {
    if (u.sha === null) delete next[u.path];
    else next[u.path] = u.sha;
  }
  return next;
}

/** Base after pulling: pulled and converged paths now match the remote; conflicts keep their old base. */
export function computeBaseAfterPull(base: ShaMap, plan: SyncPlan): ShaMap {
  return applyShaUpdates(base, [
    ...plan.pull.map((c) => ({ path: c.path, sha: c.sha })),
    ...plan.converged.map((c) => ({ path: c.path, sha: c.remoteSha })),
  ]);
}

/** Base update for paths that only converged (used when we do not apply pulls). */
export function computeBaseAfterConverge(base: ShaMap, plan: SyncPlan): ShaMap {
  return applyShaUpdates(
    base,
    plan.converged.map((c) => ({ path: c.path, sha: c.remoteSha })),
  );
}

export function computeBaseAfterPush(base: ShaMap, pushed: PushChange[]): ShaMap {
  return applyShaUpdates(
    base,
    pushed.map((c) => ({ path: c.path, sha: c.sha })),
  );
}

/** The remote snapshot after we pushed `pushed` on top of `remote`. */
export function snapshotAfterPush(
  remote: RemoteSnapshot,
  pushed: PushChange[],
  commitSha: string,
  treeSha: string,
): RemoteSnapshot {
  const files = applyShaUpdates(
    remote.files,
    pushed.map((c) => ({ path: c.path, sha: c.sha })),
  );
  const modes = { ...remote.modes };
  for (const c of pushed) {
    if (c.kind === "delete") delete modes[c.path];
    else if (!modes[c.path]) modes[c.path] = "100644";
  }
  return { ...remote, commitSha, treeSha, files, modes };
}

// ---------------------------------------------------------------- conflicts

export interface Conflict extends ConflictRef {
  /** Local content (null = deleted locally). */
  local: string | null;
  /** Remote content (null = deleted remotely or not text). */
  remote: string | null;
  /** Content at the last sync (null = file did not exist, or is unavailable). */
  base: string | null;
}

export function buildConflicts(
  refs: ConflictRef[],
  local: LocalFile[],
  remoteContents: Record<string, string | null | undefined>,
  baseContents: Record<string, string | null | undefined>,
): Conflict[] {
  const byPath = new Map(local.map((f) => [f.path, f.content] as const));
  return refs.map((ref) => ({
    ...ref,
    local: byPath.get(ref.path) ?? null,
    remote: ref.remoteSha === null ? null : (remoteContents[ref.path] ?? null),
    base: ref.baseSha === null ? null : (baseContents[ref.path] ?? null),
  }));
}

export type Resolution = "local" | "remote" | { content: string };

export interface ConflictResolution {
  /** Local file to write (content null = delete). null means the editor keeps its version. */
  fileChange: { path: string; content: string | null } | null;
  baseUpdate: ShaUpdate;
}

/**
 * Resolves one conflict. The resolution only rewrites the base (and possibly one
 * local file); keeping the local version simply turns the conflict into an ordinary
 * local change that the next push sends.
 */
export function resolveConflict(conflict: Conflict, choice: Resolution): ConflictResolution {
  const baseUpdate: ShaUpdate = { path: conflict.path, sha: conflict.remoteSha };
  if (choice === "local") return { fileChange: null, baseUpdate };
  if (choice === "remote") {
    return { fileChange: { path: conflict.path, content: conflict.remote }, baseUpdate };
  }
  return { fileChange: { path: conflict.path, content: choice.content }, baseUpdate };
}

// ----------------------------------------------------------------- messages

export const DEFAULT_COMMIT_TEMPLATE = "Update {files} via Zuup Code";

/**
 * Formats a commit message. Placeholders: {files} ("main.py" or "3 files"),
 * {count}, {paths} (comma separated, truncated).
 */
export function formatCommitMessage(template: string | null | undefined, paths: string[]): string {
  const tpl = template && template.trim() ? template.trim() : DEFAULT_COMMIT_TEMPLATE;
  const files = paths.length === 1 ? paths[0] : `${paths.length} files`;
  const list = paths.slice(0, 5).join(", ") + (paths.length > 5 ? ", ..." : "");
  const message = tpl
    .replace(/\{files\}/g, files)
    .replace(/\{count\}/g, String(paths.length))
    .replace(/\{paths\}/g, list)
    .trim();
  return (message || DEFAULT_COMMIT_TEMPLATE.replace("{files}", files)).slice(0, 500);
}
