import { getLanguageById, isKnownLanguageId } from "@/lib/languages";
import type { SavedProject } from "@/lib/projectStorage";

export type SortKey = "edited" | "name";
export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Natural direction for each key: newest first for dates, A to Z for names. */
export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  edited: "desc",
  name: "asc",
};

export const DEFAULT_SORT: SortState = { key: "edited", direction: "desc" };

/** Clicking the active column flips it; clicking another column starts at its natural direction. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: DEFAULT_DIRECTION[key] };
}

function timeOf(value: string | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Returns a new array; ties fall back to name, then id, so the order is stable. */
export function sortProjects<T extends Pick<SavedProject, "id" | "name" | "updated_at">>(
  projects: readonly T[],
  sort: SortState,
): T[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => {
    let cmp = 0;
    if (sort.key === "edited") cmp = timeOf(a.updated_at) - timeOf(b.updated_at);
    else cmp = collator.compare(a.name.trim(), b.name.trim());
    if (cmp !== 0) return cmp * sign;
    return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
  });
}

export interface ProjectMatch<T> {
  project: T;
  /** Set when the query matched a file name but not the project itself. */
  matchedFile?: string;
}

/**
 * Case-insensitive filter over project name, language (id or label), description and file names.
 * Every whitespace-separated term must match somewhere.
 */
export function filterProjects<T extends Pick<SavedProject, "name" | "language" | "description" | "files">>(
  projects: readonly T[],
  query: string,
): ProjectMatch<T>[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return projects.map((project) => ({ project }));

  const out: ProjectMatch<T>[] = [];
  for (const project of projects) {
    const own = [project.name, project.language, languageLabel(project.language), project.description ?? ""]
      .join("\n")
      .toLowerCase();
    const fileNames = (project.files ?? []).map((f) => f.name);
    let matchedFile: string | undefined;
    const ok = terms.every((term) => {
      if (own.includes(term)) return true;
      const hit = fileNames.find((n) => n.toLowerCase().includes(term));
      if (hit && !matchedFile) matchedFile = hit;
      return Boolean(hit);
    });
    if (ok) out.push(matchedFile ? { project, matchedFile } : { project });
  }
  return out;
}

export function languageLabel(id: string): string {
  if (!id) return "Plain Text";
  return isKnownLanguageId(id) ? getLanguageById(id).label : id;
}

export function languageExtension(id: string): string {
  return isKnownLanguageId(id) ? getLanguageById(id).extension : "";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short relative time for list rows: "Just now", "5 minutes ago", "Yesterday", "3 days ago",
 * then a calendar date ("12 Mar", or "12 Mar 2024" outside the current year).
 */
export function formatRelativeTime(value: string | number | Date, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const t = date.getTime();
  if (Number.isNaN(t)) return "Unknown";
  const diff = now.getTime() - t;

  if (diff < MINUTE) return "Just now"; // also covers small clock skew into the future
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  }
  if (diff < DAY && date.getDate() === now.getDate()) {
    const h = Math.floor(diff / HOUR);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.ceil((startOfToday - t) / DAY);
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Full timestamp for the title tooltip. */
export function formatFullDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Sorting Basics" -> "Sorting Basics copy", "X copy" -> "X copy 2", avoiding names already taken. */
export function copyName(name: string, existing: readonly string[]): string {
  const base = name.replace(/ copy(?: \d+)?$/, "");
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  let candidate = `${base} copy`;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base} copy ${i}`;
  return candidate;
}

/** Most common language among uploaded files, falling back to Python. */
export function primaryLanguage(files: readonly { language: string }[]): string {
  const counts = new Map<string, number>();
  for (const f of files) counts.set(f.language, (counts.get(f.language) ?? 0) + 1);
  let best = "python";
  let bestCount = 0;
  for (const [lang, n] of counts) {
    if (n > bestCount) {
      best = lang;
      bestCount = n;
    }
  }
  return best;
}
