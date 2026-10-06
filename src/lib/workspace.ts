import { createFile, type FileTab } from "./fileSystem";
import { ancestorFolders, makeUniquePath, sanitizeImportedPath, type NamespaceState } from "./fileNames";
import { detectLanguageFromFilename, isKnownLanguageId } from "./languages";

/**
 * Pure helpers for the in-memory editor workspace (files, folders, open tabs) and for persisting
 * the scratch workspace to localStorage so a blank-start editor never loses work on refresh.
 */

export interface WorkspaceState {
  files: FileTab[];
  folders: string[];
  /** Id of the file shown in the editor, or "" when no tab is open. */
  activeFileId: string;
  /** Ids of the files that have an open tab, in tab order. */
  openTabIds: string[];
}

export interface PersistedWorkspace extends WorkspaceState {
  projectName: string | null;
}

export const WORKSPACE_STORAGE_KEY = "zuup_workspace_v1";
export const FORK_STORAGE_KEY = "zuup_fork_project";
const SNAPSHOT_VERSION = 1;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function emptyWorkspace(): WorkspaceState {
  return { files: [], folders: [], activeFileId: "", openTabIds: [] };
}

// ── State transitions ────────────────────────────────────────────────────────

function withParentFolders(folders: string[], path: string): string[] {
  const parents = ancestorFolders(path).filter((p) => !folders.includes(p));
  return parents.length > 0 ? [...folders, ...parents] : folders;
}

/** Makes `id` the active file and makes sure it has a tab. Unknown ids are ignored. */
export function openFile(state: WorkspaceState, id: string): WorkspaceState {
  if (!state.files.some((f) => f.id === id)) return state;
  if (state.activeFileId === id && state.openTabIds.includes(id)) return state;
  return {
    ...state,
    activeFileId: id,
    openTabIds: state.openTabIds.includes(id) ? state.openTabIds : [...state.openTabIds, id],
  };
}

/** Adds a file (registering its parent folders) and opens it. */
export function addFile(state: WorkspaceState, file: FileTab): WorkspaceState {
  const next: WorkspaceState = {
    ...state,
    files: [...state.files, file],
    folders: withParentFolders(state.folders, file.name),
  };
  return openFile(next, file.id);
}

/** Adds several files without changing which tab is active, except to open the first one. */
export function addFiles(state: WorkspaceState, newFiles: FileTab[]): WorkspaceState {
  if (newFiles.length === 0) return state;
  let folders = state.folders;
  for (const f of newFiles) folders = withParentFolders(folders, f.name);
  return openFile({ ...state, files: [...state.files, ...newFiles], folders }, newFiles[0].id);
}

/** Adds files (registering their parent folders) without opening a tab or changing the active file. */
export function appendFiles(state: WorkspaceState, newFiles: FileTab[]): WorkspaceState {
  if (newFiles.length === 0) return state;
  let folders = state.folders;
  for (const f of newFiles) folders = withParentFolders(folders, f.name);
  return { ...state, files: [...state.files, ...newFiles], folders };
}

export interface ImportItem {
  name: string;
  content: string;
  /** Used when it is a known language id, otherwise the language is detected from the name. */
  languageId?: string;
}

/**
 * Turns outside data (uploads, cloud projects, shared links, forks) into files:
 * paths are sanitized, collisions get a numeric suffix and the language is resolved.
 */
export function importFiles(items: ImportItem[], existing: NamespaceState = { files: [], folders: [] }): FileTab[] {
  const taken: NamespaceState = { files: [...existing.files], folders: existing.folders };
  const out: FileTab[] = [];
  for (const item of items) {
    const clean = sanitizeImportedPath(item.name) ?? "untitled.txt";
    const path = makeUniquePath(clean, taken);
    const languageId =
      item.languageId && isKnownLanguageId(item.languageId) ? item.languageId : detectLanguageFromFilename(path).id;
    const file = createFile(path, languageId, typeof item.content === "string" ? item.content : "");
    taken.files.push({ id: file.id, name: file.name });
    out.push(file);
  }
  return out;
}

/** Folder paths implied by a set of files. */
export function foldersOf(files: Pick<FileTab, "name">[]): string[] {
  const all = new Set<string>();
  for (const f of files) for (const p of ancestorFolders(f.name)) all.add(p);
  return Array.from(all);
}

/** Stable fingerprint of the saveable parts of a file list (used to detect edits made while saving). */
export function workspaceSignature(files: Pick<FileTab, "id" | "name" | "content" | "languageId">[]): string {
  return JSON.stringify(files.map((f) => [f.id, f.name, f.languageId, f.content]));
}

function pickActiveAfterRemoval(previousTabs: string[], remainingTabs: string[], removedId: string): string {
  if (remainingTabs.length === 0) return "";
  const index = previousTabs.indexOf(removedId);
  const neighbour = remainingTabs[Math.min(Math.max(index, 0), remainingTabs.length - 1)];
  return neighbour;
}

/** Closes a tab without deleting the file. Closing the active tab activates its neighbour. */
export function closeTab(state: WorkspaceState, id: string): WorkspaceState {
  if (!state.openTabIds.includes(id)) return state;
  const openTabIds = state.openTabIds.filter((t) => t !== id);
  const activeFileId =
    state.activeFileId === id ? pickActiveAfterRemoval(state.openTabIds, openTabIds, id) : state.activeFileId;
  return { ...state, openTabIds, activeFileId };
}

/** Deletes a file and its tab. Deleting the active file activates a neighbouring tab, if any. */
export function removeFile(state: WorkspaceState, id: string): WorkspaceState {
  if (!state.files.some((f) => f.id === id)) return state;
  const closed = closeTab(state, id);
  return { ...closed, files: state.files.filter((f) => f.id !== id) };
}

function isInFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Deletes a folder, every file inside it and their tabs. */
export function removeFolder(state: WorkspaceState, folderPath: string): WorkspaceState {
  const doomed = state.files.filter((f) => f.name.startsWith(`${folderPath}/`)).map((f) => f.id);
  let next: WorkspaceState = { ...state, folders: state.folders.filter((f) => !isInFolder(f, folderPath)) };
  for (const id of doomed) next = removeFile(next, id);
  return next;
}

/** Moves a folder (and everything inside it) to a new path. */
export function renameFolder(state: WorkspaceState, oldPath: string, newPath: string): WorkspaceState {
  const move = (p: string) => (p === oldPath ? newPath : p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p);
  const files = state.files.map((f) => {
    const name = move(f.name);
    return name === f.name ? f : { ...f, name, isDirty: true };
  });
  return { ...state, files, folders: withParentFolders(state.folders.map(move), newPath + "/x") };
}

export function isWorkspaceEmpty(state: Pick<WorkspaceState, "files" | "folders">): boolean {
  return state.files.length === 0 && state.folders.length === 0;
}

// ── Persistence ──────────────────────────────────────────────────────────────

export function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function serializeWorkspace(state: WorkspaceState, projectName: string | null): string {
  return JSON.stringify({
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    projectName,
    activeFileId: state.activeFileId,
    openTabIds: state.openTabIds,
    folders: state.folders,
    files: state.files.map((f) => ({ id: f.id, name: f.name, languageId: f.languageId, content: f.content })),
  });
}

/** Parses a stored snapshot defensively. Returns null for anything that isn't a usable snapshot. */
export function parseWorkspace(raw: string | null): PersistedWorkspace | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.version !== SNAPSHOT_VERSION || !Array.isArray(obj.files)) return null;

  const seenIds = new Set<string>();
  const files: FileTab[] = [];
  for (const item of obj.files) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.id !== "string" || f.id === "" || seenIds.has(f.id)) continue;
    if (typeof f.name !== "string" || f.name === "" || typeof f.content !== "string") continue;
    seenIds.add(f.id);
    files.push({
      id: f.id,
      name: f.name,
      languageId: typeof f.languageId === "string" && isKnownLanguageId(f.languageId) ? f.languageId : "plaintext",
      content: f.content,
      isDirty: false,
    });
  }

  const folders = Array.isArray(obj.folders)
    ? Array.from(new Set(obj.folders.filter((x): x is string => typeof x === "string" && x !== "")))
    : [];

  const openTabIds = Array.isArray(obj.openTabIds)
    ? Array.from(new Set(obj.openTabIds.filter((x): x is string => typeof x === "string" && seenIds.has(x))))
    : files.slice(0, 1).map((f) => f.id);

  let activeFileId = typeof obj.activeFileId === "string" ? obj.activeFileId : "";
  if (!openTabIds.includes(activeFileId)) activeFileId = openTabIds[0] ?? "";

  return {
    files,
    folders,
    activeFileId,
    openTabIds,
    projectName: typeof obj.projectName === "string" ? obj.projectName : null,
  };
}

/** Writes the scratch workspace. Returns false when storage is unavailable or full. */
export function saveWorkspace(
  state: WorkspaceState,
  projectName: string | null,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspace(state, projectName));
    return true;
  } catch {
    return false;
  }
}

export function loadWorkspace(storage: StorageLike | null = getDefaultStorage()): PersistedWorkspace | null {
  if (!storage) return null;
  try {
    return parseWorkspace(storage.getItem(WORKSPACE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function hasStoredWorkspace(storage: StorageLike | null = getDefaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(WORKSPACE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearWorkspace(storage: StorageLike | null = getDefaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Storage may be blocked; nothing else to clean up.
  }
}

/**
 * True when the URL (or a pending fork) says the editor should open something specific
 * instead of restoring the scratch workspace.
 */
export function hasExternalWorkspaceSource(input: {
  search: string;
  pathname: string;
  forkPayload: string | null;
}): boolean {
  const params = new URLSearchParams(input.search);
  if (params.get("project")) return true;
  if (input.forkPayload) return true;
  return /^\/(?:s|p)\/[A-Za-z0-9\-_]+$/.test(input.pathname);
}

/** Reads the pieces of the environment `hasExternalWorkspaceSource` needs. SSR-safe. */
export function readExternalWorkspaceSource(storage: StorageLike | null = getDefaultStorage()): boolean {
  if (typeof window === "undefined") return false;
  let forkPayload: string | null = null;
  try {
    forkPayload = storage ? storage.getItem(FORK_STORAGE_KEY) : null;
  } catch {
    forkPayload = null;
  }
  return hasExternalWorkspaceSource({
    search: window.location.search,
    pathname: window.location.pathname,
    forkPayload,
  });
}
