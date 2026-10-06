import { createFile, type FileTab } from "./fileSystem";
import { detectLanguageFromFilename } from "./languages";
import { appendFiles, foldersOf, removeFile, type WorkspaceState } from "./workspace";
import { MAX_FILES, type AppliedChange, type GitHubLink, type LocalFile } from "./github";

/**
 * Pure glue between the editor workspace and GitHub sync. A workspace file's `name` is already its
 * path relative to the project root ("src/main.py"), which is exactly the sync library's local path,
 * so the mapping is 1:1 and file ids, languages and tabs stay editor-only concerns.
 */

/** Project files as the sync engine sees them. Folders are implicit (git has no empty folders). */
export function toSyncFiles(files: Pick<FileTab, "name" | "content">[]): LocalFile[] {
  return files.map((f) => ({ path: f.name, content: f.content }));
}

export interface ApplyRemoteOptions {
  /** Mark touched files as unsaved (cloud projects use this to drive the cloud autosave). */
  markDirty?: boolean;
}

export interface ApplyRemoteResult {
  state: WorkspaceState;
  added: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Applies a `remote-applied` event to the workspace. File ids are kept for modified files so open
 * tabs and editor models follow the new content; added files appear in the Explorer without stealing
 * focus; deleted files lose their tab. Content always comes from `files` (the controller's view).
 */
export function applyRemoteChanges(
  state: WorkspaceState,
  files: LocalFile[],
  changes: AppliedChange[],
  options: ApplyRemoteOptions = {},
): ApplyRemoteResult {
  const contents = new Map(files.map((f) => [f.path, f.content] as const));
  const result: ApplyRemoteResult = { state, added: [], modified: [], deleted: [] };
  let next = state;
  const created: FileTab[] = [];

  for (const change of changes) {
    const existing = next.files.find((f) => f.name === change.path);
    const content = contents.get(change.path);
    if (change.kind === "deleted" || content === undefined) {
      if (existing) {
        next = removeFile(next, existing.id);
        result.deleted.push(change.path);
      }
      continue;
    }
    if (existing) {
      if (existing.content !== content) {
        next = {
          ...next,
          files: next.files.map((f) =>
            f.id === existing.id ? { ...f, content, isDirty: options.markDirty ? true : f.isDirty } : f
          ),
        };
      }
      result.modified.push(change.path);
      continue;
    }
    const file = createFile(change.path, detectLanguageFromFilename(change.path).id, content);
    if (options.markDirty) file.isDirty = true;
    created.push(file);
    result.added.push(change.path);
  }

  result.state = appendFiles(next, created);
  return result;
}

const ENTRY_PATTERNS = [/^main\.[^/]+$/i, /^index\.[^/]+$/i, /^app\.[^/]+$/i, /^readme(\.[^/]+)?$/i];

/** The file to open after importing a repository: a top-level main/index/app file, then the README. */
export function pickEntryFile(paths: string[]): string | null {
  if (paths.length === 0) return null;
  for (const pattern of ENTRY_PATTERNS) {
    const hit = paths.find((p) => pattern.test(p));
    if (hit) return hit;
  }
  return [...paths].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
}

/**
 * A fresh workspace holding exactly `files` (paths are kept verbatim so they keep matching the
 * repository). The entry file, if any, is opened in a tab.
 */
export function workspaceFromSyncFiles(files: LocalFile[], options: ApplyRemoteOptions = {}): WorkspaceState {
  const tabs = files.map((f) => {
    const file = createFile(f.path, detectLanguageFromFilename(f.path).id, f.content);
    if (options.markDirty) file.isDirty = true;
    return file;
  });
  const entryPath = pickEntryFile(files.map((f) => f.path));
  const entry = tabs.find((t) => t.name === entryPath);
  return {
    files: tabs,
    folders: foldersOf(tabs),
    activeFileId: entry?.id ?? "",
    openTabIds: entry ? [entry.id] : [],
  };
}

/** Actionable wording for sync errors the user has to fix (retrying alone will not help). */
export function describeSyncError(code: string | null | undefined): { title: string; detail: string } | null {
  switch (code) {
    case "too_many_files":
      return {
        title: "Too many files to sync",
        detail: `GitHub sync supports at most ${MAX_FILES} files. Remove files from the project, or link a sub-folder of the repository instead.`,
      };
    case "tree_truncated":
      return { title: "Repository too large", detail: "GitHub could not list this repository in one go. Link a smaller repository or a sub-folder." };
    case "not_found":
      return { title: "Repository or branch not found", detail: "It may have been deleted, renamed, or your sign-in cannot see it. Unlink and link it again." };
    default:
      return null;
  }
}

function encodeSegments(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** Web URL of the linked branch (and sub-folder) on github.com. */
export function repoWebUrl(link: Pick<GitHubLink, "owner" | "repo" | "branch" | "subdir">): string {
  const base = `https://github.com/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo)}`;
  const tail = encodeSegments(link.subdir ? `${link.branch}/${link.subdir}` : link.branch);
  return `${base}/tree/${tail}`;
}

/** "a.py", "a.py and b.py", "a.py, b.py and 3 more" */
export function summarizePaths(paths: string[], max = 2): string {
  if (paths.length === 0) return "";
  if (paths.length === 1) return paths[0];
  if (paths.length <= max) return `${paths.slice(0, -1).join(", ")} and ${paths[paths.length - 1]}`;
  return `${paths.slice(0, max).join(", ")} and ${paths.length - max} more`;
}

/**
 * Remembers which error codes were already shown so a flapping connection or a long outage
 * produces one toast, not one per retry. `reset()` once sync succeeds again.
 */
export class ErrorToastGate {
  private shown = new Set<string>();

  shouldShow(code: string): boolean {
    if (this.shown.has(code)) return false;
    this.shown.add(code);
    return true;
  }

  reset(): void {
    this.shown.clear();
  }
}
