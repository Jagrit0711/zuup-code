// ==============================================================
// Zuup Code — Local File Revision & Timeline Engine
// Provides VS Code-style file snapshot history, diff points,
// and one-click rollback/restore for all active files.
// ==============================================================

export interface TimelineEntry {
  id: string;
  fileId: string;
  fileName: string;
  timestamp: number;
  label: string;
  content: string;
  charCount: number;
  lineCount: number;
}

const STORAGE_PREFIX = "zuup_timeline_";
const MAX_SNAPSHOTS_PER_FILE = 40;

function getStorageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

/**
 * Retrieve all timeline snapshots for a specific file, newest first.
 */
export function getFileTimeline(fileId: string): TimelineEntry[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(getStorageKey(fileId));
    if (!raw) return [];
    const list: TimelineEntry[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("Failed to load timeline for file", fileId, err);
    return [];
  }
}

/**
 * Record a snapshot in the file timeline.
 * Deduplicates consecutive entries with identical content to prevent bloat.
 */
export function recordSnapshot(
  fileId: string,
  fileName: string,
  content: string,
  label: string
): TimelineEntry | null {
  if (typeof window === "undefined" || !window.localStorage || !fileId) return null;

  try {
    const existing = getFileTimeline(fileId);
    // Don't record if content is identical to the most recent snapshot
    if (existing.length > 0 && existing[0].content === content) {
      return null;
    }

    const lines = content.split("\n").length;
    const entry: TimelineEntry = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileId,
      fileName,
      timestamp: Date.now(),
      label,
      content,
      charCount: content.length,
      lineCount: lines,
    };

    const updated = [entry, ...existing].slice(0, MAX_SNAPSHOTS_PER_FILE);
    localStorage.setItem(getStorageKey(fileId), JSON.stringify(updated));
    return entry;
  } catch (err) {
    console.warn("Failed to record timeline snapshot", err);
    return null;
  }
}

/**
 * Clear the timeline for a file (e.g. when file is deleted).
 */
export function clearFileTimeline(fileId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(getStorageKey(fileId));
  } catch (err) {
    console.warn("Failed to clear timeline for file", fileId, err);
  }
}

/**
 * Format relative time (e.g., "Just now", "2m ago", "1h ago", "Yesterday").
 */
export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
