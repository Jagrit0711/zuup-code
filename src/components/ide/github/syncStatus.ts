import type { SyncState } from "@/lib/github";
import { describeSyncError } from "@/lib/githubWorkspace";

export type SyncTone = "ok" | "busy" | "warn" | "error" | "muted";

export interface SyncStatusView {
  label: string;
  /** Longer text for tooltips and the dropdown header. */
  detail: string;
  tone: SyncTone;
  spinning: boolean;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** How the status bar presents the controller state. */
export function describeSyncStatus(state: SyncState | null, options: { now?: number } = {}): SyncStatusView {
  if (!state) return { label: "GitHub", detail: "Not connected", tone: "muted", spinning: false };

  switch (state.status) {
    case "idle":
      return { label: "Connecting", detail: "Starting GitHub sync", tone: "busy", spinning: true };
    case "synced":
      return { label: "Synced", detail: "Everything is on GitHub", tone: "ok", spinning: false };
    case "pending":
      return {
        label: "Pending",
        detail: `${plural(state.pendingPaths.length, "change")} waiting to be pushed`,
        tone: "busy",
        spinning: false,
      };
    case "pushing":
      return { label: "Pushing", detail: "Committing your changes to GitHub", tone: "busy", spinning: true };
    case "pulling":
      return { label: "Pulling", detail: "Fetching changes from GitHub", tone: "busy", spinning: true };
    case "conflict":
      return {
        label: plural(state.conflicts.length, "conflict"),
        detail: "Changed both here and on GitHub. Choose which version to keep.",
        tone: "error",
        spinning: false,
      };
    case "held": {
      const n = state.heldDeletes?.paths.length ?? 0;
      const total = state.heldDeletes?.baseCount ?? n;
      return {
        label: "Sync on hold",
        detail: `This would delete ${plural(n, "file")} (of ${total}) on GitHub. Confirm the deletion or restore them.`,
        tone: "warn",
        spinning: false,
      };
    }
    case "offline": {
      const retry = state.nextAttemptAt ? Math.max(0, Math.round((state.nextAttemptAt - (options.now ?? Date.now())) / 1000)) : null;
      return {
        label: "Offline",
        detail: retry !== null && retry > 0 ? `Can't reach GitHub. Retrying in ${retry}s.` : "Can't reach GitHub. Will retry.",
        tone: "warn",
        spinning: false,
      };
    }
    case "paused":
      return { label: "Paused", detail: "Sync is paused. Edits stay local until you resume.", tone: "muted", spinning: false };
    case "unauthenticated":
      return { label: "Sign in", detail: "GitHub rejected the token. Sign in again to keep syncing.", tone: "error", spinning: false };
    case "error": {
      const known = describeSyncError(state.lastError?.code);
      if (known) return { label: known.title, detail: known.detail, tone: "error", spinning: false };
      return {
        label: "Sync error",
        detail: state.lastError?.message ?? "GitHub sync failed. It will retry automatically.",
        tone: "error",
        spinning: false,
      };
    }
  }
}

export const TONE_CLASS: Record<SyncTone, string> = {
  ok: "text-green-400/90",
  busy: "text-primary",
  warn: "text-yellow-500/90",
  error: "text-red-400",
  muted: "text-muted-foreground",
};
