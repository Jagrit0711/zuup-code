import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  type AppliedChange,
  type GitHubAuth,
  type GitHubClient,
  type GitHubLink,
  type ImportProgress,
  type ImportResult,
  type LocalFile,
  type Resolution,
  type SyncEvent,
  type SyncControllerOptions,
  type SyncState,
  SyncController,
  clearAuth,
  completeOAuthRedirect,
  createGitHubClient,
  createLink,
  getAuth,
  getLink,
  importRepo,
  linkFromImport,
  moveLink,
  removeLink,
  saveLink,
  subscribeAuth,
} from "@/lib/github";
import { ErrorToastGate, describeSyncError, repoWebUrl, summarizePaths } from "@/lib/githubWorkspace";

export interface RepoTarget {
  owner: string;
  repo: string;
  branch: string;
  subdir: string;
}

export interface UseGitHubSyncOptions {
  /** Cloud project id, or "scratch" for the unsaved workspace. */
  projectKey: string;
  /** False while the editor is not ready (e.g. the Zuup session is still loading). */
  enabled: boolean;
  /** Current project files. Must read live state (a ref), not a render snapshot. */
  getFiles: () => LocalFile[];
  /** Any value that changes whenever the project files change (the files array works). */
  filesVersion: unknown;
  /** Apply pulled changes to the editor synchronously. */
  onRemoteApplied: (files: LocalFile[], changes: AppliedChange[]) => void;
  /** Replace every project file (repository import). */
  onReplaceFiles: (files: LocalFile[]) => void;
  /** Tests: a client bound to a fake GitHub, and controller timings. */
  createClient?: () => GitHubClient;
  controllerOptions?: Partial<Omit<SyncControllerOptions, "link" | "client" | "files" | "persistLink">>;
}

const noopSubscribe = () => () => {};
const nullState = () => null;

/**
 * Owns GitHub sign-in state, the project's link and one SyncController per open project,
 * and turns controller events into editor updates and toasts.
 */
export function useGitHubSync({
  projectKey,
  enabled,
  getFiles,
  filesVersion,
  onRemoteApplied,
  onReplaceFiles,
  createClient = createGitHubClient,
  controllerOptions,
}: UseGitHubSyncOptions) {
  const [auth, setAuthState] = useState<GitHubAuth | null>(() => getAuth());
  const [link, setLink] = useState<GitHubLink | null>(() => getLink(projectKey));
  // Bumped whenever the stored link is replaced, so the controller is rebuilt from it.
  const [generation, setGeneration] = useState(0);
  const [controller, setController] = useState<SyncController | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const latest = useRef({ getFiles, onRemoteApplied, onReplaceFiles, projectKey, controllerOptions });
  latest.current = { getFiles, onRemoteApplied, onReplaceFiles, projectKey, controllerOptions };

  const client = useMemo(() => (auth ? createClient() : null), [auth, createClient]);
  const signedIn = !!auth;

  useEffect(() => subscribeAuth(setAuthState), []);

  // Finish an OAuth round trip: the token arrives in the URL fragment of the page we return to.
  // No "alive" guard: StrictMode's second mount finds the fragment already consumed, so the
  // first call must still report its result.
  useEffect(() => {
    void completeOAuthRedirect().then((completion) => {
      if (!completion) return;
      if (completion.type === "signed-in") {
        toast.success(`Signed in to GitHub${completion.auth.login ? ` as @${completion.auth.login}` : ""}`);
        setDialogOpen(true);
      } else {
        toast.error("GitHub sign-in failed", { description: completion.message });
      }
    });
  }, []);

  useEffect(() => {
    setLink(getLink(projectKey));
  }, [projectKey, generation]);

  // The running controller plus a flag that stops it writing its link after it was replaced.
  const activeRef = useRef<{ controller: SyncController; retire: () => void } | null>(null);
  const retireActive = useCallback(() => {
    activeRef.current?.retire();
    activeRef.current = null;
  }, []);

  const gateRef = useRef(new ErrorToastGate());
  // Set while a user-initiated action runs, so its own result toast replaces the automatic ones.
  const quietRef = useRef(0);

  // ── Controller lifecycle: one per open project with a link ──
  useEffect(() => {
    if (!enabled || !signedIn || !client) return;
    const stored = getLink(projectKey);
    if (!stored) return;

    let retired = false;
    // The controller reads the live editor files before every plan (an empty or half-loaded
    // project is caught by its mass-delete hold, so no special case is needed here).
    const instance = new SyncController({
      ...latest.current.controllerOptions,
      link: stored,
      client,
      getFiles: () => latest.current.getFiles(),
      persistLink: (next) => {
        if (!retired) saveLink(next);
      },
    });
    const gate = gateRef.current;
    gate.reset();

    const openDialog = () => setDialogOpen(true);
    const openConflicts = () => setConflictsOpen(true);

    const handle = (event: SyncEvent) => {
      switch (event.type) {
        case "remote-applied": {
          latest.current.onRemoteApplied(event.files, event.changes);
          // The editor now holds the remote content; hand the live state straight back so a stale
          // render snapshot can never be mistaken for a local edit.
          instance.setFiles(latest.current.getFiles());
          if (quietRef.current > 0) break;
          toast.info("Pulled changes from GitHub", { description: summarizePaths(event.changes.map((c) => c.path), 3) });
          break;
        }
        case "conflict":
          toast.warning(`${event.conflicts.length} file${event.conflicts.length === 1 ? "" : "s"} changed on both sides`, {
            description: "Your version is kept until you choose.",
            action: { label: "Resolve", onClick: openConflicts },
          });
          break;
        case "deletes-held":
          toast.warning(`This would delete ${event.paths.length} file${event.paths.length === 1 ? "" : "s"} on GitHub`, {
            description: "Sync is on hold until you confirm or restore them.",
            action: { label: "Review", onClick: openDialog },
            duration: 10_000,
          });
          break;
        case "state":
          if (event.state.status === "synced" || event.state.status === "pending") gate.reset();
          break;
        case "error": {
          if (quietRef.current > 0 || !gate.shouldShow(event.code)) break;
          if (event.code === "network") {
            toast.warning("GitHub is unreachable", { description: "Edits stay here and will be pushed when the connection returns." });
          } else if (event.code === "unauthorized") {
            toast.error("GitHub sign-in expired", { description: "Sign in again to keep syncing.", action: { label: "Sign in", onClick: openDialog } });
          } else {
            const known = describeSyncError(event.code);
            toast.error(known?.title ?? "GitHub sync failed", {
              description: known?.detail ?? event.message,
              action: known ? { label: "Open", onClick: openDialog } : undefined,
            });
          }
          break;
        }
        default:
          break;
      }
    };
    const off = instance.on(handle);
    const entry = {
      controller: instance,
      retire: () => {
        retired = true;
        off();
        instance.dispose();
      },
    };
    activeRef.current = entry;
    setController(instance);
    instance.start();

    return () => {
      entry.retire();
      if (activeRef.current === entry) activeRef.current = null;
      setController((current) => (current === instance ? null : current));
    };
  }, [enabled, signedIn, client, projectKey, generation]);

  // Feed every edit to the controller (reads live state, see getFiles).
  useEffect(() => {
    controller?.setFiles(latest.current.getFiles());
  }, [controller, filesVersion]);

  const subscribe = useMemo(() => (controller ? controller.subscribe.bind(controller) : noopSubscribe), [controller]);
  const getSnapshot = useMemo(() => (controller ? controller.getState.bind(controller) : nullState), [controller]);
  const state: SyncState | null = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ── Link management ──
  const replaceLink = useCallback(
    (next: GitHubLink | null) => {
      retireActive();
      if (next) saveLink(next);
      else removeLink(latest.current.projectKey);
      setGeneration((g) => g + 1);
    },
    [retireActive]
  );

  /** Downloads the repository, replaces the project files with it and links from that clean base. */
  const importIntoProject = useCallback(
    async (target: RepoTarget, onProgress?: (progress: ImportProgress) => void): Promise<ImportResult | null> => {
      if (!client) return null;
      const key = latest.current.projectKey;
      const result = await importRepo(client, { ...target, onProgress });
      if (latest.current.projectKey !== key) return null; // the user switched projects meanwhile
      retireActive();
      latest.current.onReplaceFiles(result.files);
      replaceLink(linkFromImport(key, target, result));
      return result;
    },
    [client, replaceLink, retireActive]
  );

  /** Links with an empty base: the first sync pushes local files and surfaces differing ones as conflicts. */
  const linkForPush = useCallback(
    (target: RepoTarget) => {
      replaceLink(createLink({ projectKey: latest.current.projectKey, ...target }));
    },
    [replaceLink]
  );

  const unlink = useCallback(() => {
    replaceLink(null);
    setConflictsOpen(false);
  }, [replaceLink]);

  /** Moves the link along when a workspace is saved as a project (e.g. scratch -> cloud id). */
  const rekey = useCallback(
    (from: string, to: string) => {
      if (!getLink(from)) return;
      retireActive();
      moveLink(from, to);
      setGeneration((g) => g + 1);
    },
    [retireActive]
  );

  /** Drops a link whose workspace content is being replaced by something unrelated. */
  const forget = useCallback(
    (key: string) => {
      if (!getLink(key)) return;
      if (key === latest.current.projectKey) retireActive();
      removeLink(key);
      setGeneration((g) => g + 1);
    },
    [retireActive]
  );

  const signOut = useCallback(() => {
    retireActive();
    clearAuth();
  }, [retireActive]);

  // ── User actions on the running controller ──
  const syncNow = useCallback(async () => {
    if (!controller) return;
    quietRef.current += 1;
    try {
      const summary = await controller.syncNow();
      if (summary.ok) {
        const parts: string[] = [];
        if (summary.pushed.length) parts.push(`pushed ${summary.pushed.length}`);
        if (summary.applied.length) parts.push(`pulled ${summary.applied.length}`);
        toast.success("Synced with GitHub", { description: parts.length ? `${parts.join(", ")} file(s)` : "Already up to date" });
      } else if (summary.error) {
        toast.error("Sync failed", { description: summary.error.message });
      }
    } finally {
      quietRef.current -= 1;
    }
  }, [controller]);

  /** Applies a conflict choice; the resulting editor update is not announced as a pull. */
  const resolveConflict = useCallback(
    (path: string, choice: Resolution) => {
      if (!controller) return false;
      quietRef.current += 1;
      try {
        return controller.resolveConflict(path, choice);
      } finally {
        quietRef.current -= 1;
      }
    },
    [controller]
  );

  /** Status "held": push the deletions after all. */
  const confirmDeletes = useCallback(async () => {
    if (!controller) return;
    const count = controller.getState().heldDeletes?.paths.length ?? 0;
    quietRef.current += 1;
    try {
      const summary = await controller.confirmDeletes();
      if (summary.ok && summary.commitSha) toast.success(`Deleted ${count} file${count === 1 ? "" : "s"} on GitHub`);
      else if (summary.error) toast.error("Sync failed", { description: summary.error.message });
    } finally {
      quietRef.current -= 1;
    }
  }, [controller]);

  /** Status "held": bring the files back from GitHub instead of deleting them there. */
  const restoreDeleted = useCallback(async () => {
    if (!controller) return;
    quietRef.current += 1;
    try {
      const summary = await controller.restoreDeleted();
      if (summary.ok) {
        const n = summary.applied.length;
        toast.success(`Restored ${n} file${n === 1 ? "" : "s"} from GitHub`);
      } else if (summary.error) {
        toast.error("Could not restore the files", { description: summary.error.message });
      }
    } finally {
      quietRef.current -= 1;
    }
  }, [controller]);

  const togglePause = useCallback(() => {
    if (!controller) return;
    if (controller.getState().status === "paused") void controller.resume();
    else controller.pause();
  }, [controller]);

  const resume = useCallback(() => {
    if (controller) void controller.resume();
  }, [controller]);

  const openOnGitHub = useCallback(() => {
    const current = controller?.getLink() ?? link;
    if (current) window.open(repoWebUrl(current), "_blank", "noopener,noreferrer");
  }, [controller, link]);

  return {
    auth,
    client,
    link,
    controller,
    state,
    dialogOpen,
    setDialogOpen,
    conflictsOpen,
    setConflictsOpen,
    importIntoProject,
    linkForPush,
    unlink,
    rekey,
    forget,
    signOut,
    syncNow,
    resolveConflict,
    confirmDeletes,
    restoreDeleted,
    togglePause,
    resume,
    openOnGitHub,
  };
}

export type GitHubSync = ReturnType<typeof useGitHubSync>;
