import { GitHubSyncError } from "./errors";
import { utf8ByteLength } from "./utf8";

/** A file in the local project: `path` is relative to the synced root (subfolder already stripped). */
export interface LocalFile {
  path: string;
  content: string;
}

export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_FILES = 500;
export const MAX_PATH_LENGTH = 400;

export type SkipReason =
  | "invalid-path"
  | "ignored-directory"
  | "ignored-file"
  | "binary-extension"
  | "binary-content"
  | "too-large"
  | "duplicate-path"
  | "path-conflict"
  | "remote-unsyncable";

export interface SkippedPath {
  path: string;
  reason: SkipReason;
}

const IGNORED_DIRS = new Set([".git", "node_modules", "__pycache__"]);
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "avif", "tif", "tiff", "psd", "heic",
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar", "war",
  "mp3", "wav", "ogg", "flac", "aac", "m4a", "mp4", "mov", "avi", "mkv", "webm",
  "woff", "woff2", "ttf", "otf", "eot",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "obj", "class", "pyc", "pyo", "wasm",
  "sqlite", "sqlite3", "db", "iso", "dmg",
]);

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * Normalises a file path to forward slashes with no leading/trailing slash.
 * Returns null for anything that cannot be a safe repository path
 * (empty, `..` segments, control characters, absurd length).
 */
export function normalizePath(input: string): string | null {
  if (typeof input !== "string") return null;
  const unified = input.replace(/\\/g, "/");
  if (hasControlChars(unified)) return null;
  const segments: string[] = [];
  for (const seg of unified.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    segments.push(seg);
  }
  if (segments.length === 0) return null;
  const path = segments.join("/");
  if (path.length > MAX_PATH_LENGTH) return null;
  return path;
}

/** Normalises the optional sub-folder. "" means the repository root. Returns null if invalid. */
export function normalizeSubdir(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return "";
  if (input.trim() === "" || /^[\\/.\s]*$/.test(input)) return "";
  return normalizePath(input.trim());
}

export function joinRemotePath(subdir: string, path: string): string {
  return subdir ? `${subdir}/${path}` : path;
}

/** Maps a repository path to a local path, or null when it lives outside the sub-folder. */
export function toLocalPath(subdir: string, remotePath: string): string | null {
  if (!subdir) return remotePath;
  const prefix = `${subdir}/`;
  return remotePath.startsWith(prefix) && remotePath.length > prefix.length
    ? remotePath.slice(prefix.length)
    : null;
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Path-only ignore rules shared by local and remote sides. */
export function ignoreReasonForPath(path: string): SkipReason | null {
  const segments = path.split("/");
  for (let i = 0; i < segments.length - 1; i++) {
    if (IGNORED_DIRS.has(segments[i])) return "ignored-directory";
  }
  const name = segments[segments.length - 1];
  if (IGNORED_DIRS.has(name)) return "ignored-directory";
  if (IGNORED_FILES.has(name)) return "ignored-file";
  if (BINARY_EXTENSIONS.has(extensionOf(path))) return "binary-extension";
  return null;
}

export interface PreparedFiles {
  /** Syncable files, sorted by path. */
  files: LocalFile[];
  skipped: SkippedPath[];
}

/**
 * Normalises and filters a project's files into what may be synced.
 * Throws GitHubSyncError("too_many_files") past the hard cap.
 */
export function prepareLocalFiles(input: LocalFile[], maxFiles: number = MAX_FILES): PreparedFiles {
  const skipped: SkippedPath[] = [];
  const seen = new Map<string, LocalFile>();

  for (const file of input) {
    const path = normalizePath(file.path);
    if (!path) {
      skipped.push({ path: file.path, reason: "invalid-path" });
      continue;
    }
    const ignored = ignoreReasonForPath(path);
    if (ignored) {
      skipped.push({ path, reason: ignored });
      continue;
    }
    if (seen.has(path)) {
      skipped.push({ path, reason: "duplicate-path" });
      continue;
    }
    if (file.content.indexOf("\0") !== -1) {
      skipped.push({ path, reason: "binary-content" });
      continue;
    }
    if (utf8ByteLength(file.content) > MAX_FILE_BYTES) {
      skipped.push({ path, reason: "too-large" });
      continue;
    }
    seen.set(path, { path, content: file.content });
  }

  // A path that is also a directory of another file cannot exist in a git tree.
  for (const path of Array.from(seen.keys())) {
    let idx = path.indexOf("/");
    while (idx !== -1) {
      if (seen.has(path.slice(0, idx))) {
        const parent = path.slice(0, idx);
        seen.delete(parent);
        skipped.push({ path: parent, reason: "path-conflict" });
      }
      idx = path.indexOf("/", idx + 1);
    }
  }

  if (seen.size > maxFiles) {
    throw new GitHubSyncError(
      `This project has ${seen.size} syncable files; GitHub sync supports at most ${maxFiles}.`,
      "too_many_files",
    );
  }

  const files = Array.from(seen.values()).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, skipped };
}
