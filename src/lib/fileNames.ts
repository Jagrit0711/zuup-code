import { detectLanguageFromFilename, getLanguageById } from "./languages";

/** Longest allowed path (folders + file name) for a workspace entry. */
export const MAX_PATH_LENGTH = 255;

export type NameCheck = { ok: true; value: string } | { ok: false; error: string };

export interface EntryRef {
  id: string;
  name: string;
}

export interface NamespaceState {
  files: EntryRef[];
  folders: string[];
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const RESERVED_CHARS = /[\\:*?"<>|]/;

// ── Path helpers ─────────────────────────────────────────────────────────────

export function getBaseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function getDirName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** Every ancestor folder of `path`, shallowest first. ("a/b/c.py" -> ["a", "a/b"]) */
export function ancestorFolders(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    out.push(current);
  }
  return out;
}

/** Dotfiles such as ".gitignore" are treated as having no extension to append. */
function isDotfile(base: string): boolean {
  return base.startsWith(".") && base.indexOf(".", 1) === -1;
}

export function hasFileExtension(path: string): boolean {
  const base = getBaseName(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1;
}

/** Appends `extension` (e.g. ".py") when the file name has none. Dotfiles are left untouched. */
export function ensureExtension(path: string, extension: string): string {
  const base = getBaseName(path);
  if (!base || hasFileExtension(path) || isDotfile(base)) return path;
  return `${path}${extension}`;
}

/** Swaps the extension of the file name, or appends one when missing. */
export function replaceExtension(path: string, extension: string): string {
  const dir = getDirName(path);
  const base = getBaseName(path);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return joinPath(dir, `${stem}${extension}`);
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a user supplied file or folder name. Nested paths such as "src/app.py" are allowed.
 * The value is never silently rewritten: names with stray whitespace or slashes are rejected.
 */
export function validateEntryName(raw: string): NameCheck {
  if (raw.trim() === "") return { ok: false, error: "Name can't be empty." };
  if (CONTROL_CHARS.test(raw)) return { ok: false, error: "Names can't contain control characters." };
  if (raw !== raw.trim()) return { ok: false, error: "Names can't start or end with a space." };
  if (raw.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_PATH_LENGTH} characters long.` };
  }
  if (raw.startsWith("/") || raw.endsWith("/")) {
    return { ok: false, error: "Names can't start or end with a slash." };
  }
  if (RESERVED_CHARS.test(raw)) {
    return { ok: false, error: 'Names can\'t contain \\ : * ? " < > or |.' };
  }
  for (const segment of raw.split("/")) {
    if (segment === "") return { ok: false, error: "Folder names can't be empty (double slash)." };
    if (segment === "." || segment === "..") return { ok: false, error: `"${segment}" isn't allowed in a name.` };
    if (segment !== segment.trim()) {
      return { ok: false, error: "Folder and file names can't start or end with a space." };
    }
    if (segment.endsWith(".")) return { ok: false, error: "Names can't end with a dot." };
  }
  return { ok: true, value: raw };
}

function toKey(path: string): string {
  return path.toLowerCase();
}

/** Every folder path implied by registered folders plus the parents of all files. */
function collectFolderPaths(state: NamespaceState): string[] {
  const all = new Set<string>();
  for (const folder of state.folders) {
    all.add(folder);
    for (const parent of ancestorFolders(`${folder}/x`)) all.add(parent);
  }
  for (const file of state.files) {
    for (const parent of ancestorFolders(file.name)) all.add(parent);
  }
  return Array.from(all);
}

interface ConflictOptions {
  kind: "file" | "folder";
  /** A file that is being renamed, so it doesn't conflict with itself. */
  ignoreFileId?: string;
  /** A folder subtree that is being renamed/moved, so it doesn't conflict with itself. */
  ignoreFolder?: string;
}

/**
 * Checks a fully-resolved path against the workspace, case-insensitively.
 * Returns a human readable error, or null when the path is free to use.
 */
export function findPathConflict(path: string, state: NamespaceState, options: ConflictOptions): string | null {
  const key = toKey(path);
  const inIgnoredFolder = (p: string) => {
    if (!options.ignoreFolder) return false;
    const ignored = toKey(options.ignoreFolder);
    const k = toKey(p);
    return k === ignored || k.startsWith(`${ignored}/`);
  };

  const files = state.files.filter((f) => f.id !== options.ignoreFileId && !inIgnoredFolder(f.name));
  const folders = collectFolderPaths({ files, folders: state.folders.filter((f) => !inIgnoredFolder(f)) });

  const sameFile = files.find((f) => toKey(f.name) === key);
  if (sameFile) {
    return `A file named "${sameFile.name}" already exists.`;
  }
  const sameFolder = folders.find((f) => toKey(f) === key);
  if (sameFolder) {
    return options.kind === "folder"
      ? `A folder named "${sameFolder}" already exists.`
      : `A folder named "${sameFolder}" already exists, so it can't also be a file.`;
  }
  for (const parent of ancestorFolders(`${path}/x`)) {
    const asFile = files.find((f) => toKey(f.name) === toKey(parent));
    if (asFile) return `"${asFile.name}" is a file, so it can't contain other files or folders.`;
  }
  return null;
}

// ── Planning helpers (validation + defaults in one place) ────────────────────

export type NewFilePlan =
  | { ok: true; path: string; languageId: string; parentFolders: string[] }
  | { ok: false; error: string };

/**
 * Resolves what creating a file would do: validates the name, appends the default language's
 * extension when the name has none, detects the language from the final extension and checks for
 * collisions. Nothing is created here.
 */
export function planNewFile(
  raw: string,
  parentFolder: string,
  defaultLanguageId: string,
  state: NamespaceState
): NewFilePlan {
  const checked = validateEntryName(raw);
  if (checked.ok === false) return checked;

  const withExt = ensureExtension(checked.value, getLanguageById(defaultLanguageId).extension);
  const path = joinPath(parentFolder, withExt);
  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_PATH_LENGTH} characters long.` };
  }
  const conflict = findPathConflict(path, state, { kind: "file" });
  if (conflict) return { ok: false, error: conflict };

  return {
    ok: true,
    path,
    languageId: detectLanguageFromFilename(path).id,
    parentFolders: ancestorFolders(path),
  };
}

export type NewFolderPlan = { ok: true; path: string; parentFolders: string[] } | { ok: false; error: string };

export function planNewFolder(raw: string, parentFolder: string, state: NamespaceState): NewFolderPlan {
  const checked = validateEntryName(raw);
  if (checked.ok === false) return checked;
  const path = joinPath(parentFolder, checked.value);
  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_PATH_LENGTH} characters long.` };
  }
  const conflict = findPathConflict(path, state, { kind: "folder" });
  if (conflict) return { ok: false, error: conflict };
  return { ok: true, path, parentFolders: ancestorFolders(path) };
}

export type RenamePlan = { ok: true; path: string; changed: boolean } | { ok: false; error: string };

/** Renames the last segment of a file path. `newBase` must not contain slashes. */
export function planFileRename(fileId: string, newBase: string, state: NamespaceState): RenamePlan {
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return { ok: false, error: "That file no longer exists." };
  if (newBase.includes("/")) return { ok: false, error: "Names can't contain slashes when renaming." };
  const checked = validateEntryName(newBase);
  if (checked.ok === false) return checked;
  const path = joinPath(getDirName(file.name), checked.value);
  if (path === file.name) return { ok: true, path, changed: false };
  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_PATH_LENGTH} characters long.` };
  }
  const conflict = findPathConflict(path, state, { kind: "file", ignoreFileId: fileId });
  if (conflict) return { ok: false, error: conflict };
  return { ok: true, path, changed: true };
}

/** Renames the last segment of a folder path. `newBase` must not contain slashes. */
export function planFolderRename(folderPath: string, newBase: string, state: NamespaceState): RenamePlan {
  if (newBase.includes("/")) return { ok: false, error: "Names can't contain slashes when renaming." };
  const checked = validateEntryName(newBase);
  if (checked.ok === false) return checked;
  const path = joinPath(getDirName(folderPath), checked.value);
  if (path === folderPath) return { ok: true, path, changed: false };
  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_PATH_LENGTH} characters long.` };
  }
  const conflict = findPathConflict(path, state, { kind: "folder", ignoreFolder: folderPath });
  if (conflict) return { ok: false, error: conflict };
  return { ok: true, path, changed: true };
}

/** "main.py" -> "main-1.py" -> "main-2.py" until the path is free. */
export function makeUniquePath(path: string, state: NamespaceState): string {
  if (!findPathConflict(path, state, { kind: "file" })) return path;
  const dir = getDirName(path);
  const base = getBaseName(path);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let n = 1; n < 10000; n++) {
    const candidate = joinPath(dir, `${stem}-${n}${ext}`);
    if (!findPathConflict(candidate, state, { kind: "file" })) return candidate;
  }
  return `${path}-${Date.now()}`;
}

/**
 * Cleans a path that came from outside the editor (uploads, shared links, forks).
 * Returns null when nothing usable is left.
 */
export function sanitizeImportedPath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const segments = raw
    .replace(/\\/g, "/")
    .split("/")
    // eslint-disable-next-line no-control-regex
    .map((s) => s.replace(/[\u0000-\u001f\u007f:*?"<>|]/g, "").trim())
    .filter((s) => s !== "" && s !== "." && s !== "..")
    .map((s) => s.replace(/\.+$/, ""))
    .filter((s) => s !== "");
  if (segments.length === 0) return null;
  const path = segments.join("/").slice(0, MAX_PATH_LENGTH);
  const checked = validateEntryName(path);
  return checked.ok ? checked.value : null;
}

/** Result of a create/rename action the UI can react to (keep an input open, show the error). */
export type ActionResult = { ok: true } | { ok: false; error: string };
