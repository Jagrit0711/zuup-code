import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import ErrorBoundary from "@/components/ErrorBoundary";
import CodeEditor from "@/components/ide/CodeEditor";
import Sidebar, { type SidebarTab } from "@/components/ide/Sidebar";
import ActivityBar from "@/components/ide/ActivityBar";
import StatusBar from "@/components/ide/StatusBar";
import TopBar from "@/components/ide/TopBar";
import TerminalPanel, { type PanelTab } from "@/components/ide/TerminalPanel";
import HtmlPreview from "@/components/ide/HtmlPreview";
import FileTabs from "@/components/ide/FileTabs";
import Breadcrumbs from "@/components/ide/Breadcrumbs";
import EditorEmptyState from "@/components/ide/EditorEmptyState";
import SettingsModal, { type SettingsSection } from "@/components/ide/SettingsModal";
import CommandPalette, { type PaletteCommand, type PaletteMode } from "@/components/ide/palette/CommandPalette";
import { shortcutFor } from "@/components/ide/palette/shortcuts";
import { buildZip, downloadZip, zipFileName } from "@/components/ide/palette/projectZip";
import NewProjectModal from "@/components/ide/NewProjectModal";
import type { NewProjectData } from "@/components/ide/NewProjectModal";
import ShareModal from "@/components/ide/ShareModal";
import GitHubDialog from "@/components/ide/github/GitHubDialog";
import ConflictDialog from "@/components/ide/github/ConflictDialog";
import SyncStatusIndicator from "@/components/ide/github/SyncStatusIndicator";
import { useGitHubSync, type GitHubSync } from "@/hooks/useGitHubSync";
import { useRunController } from "@/hooks/useRunController";
import { combineProblemCounts, countProblems, problemsFromRunLines } from "@/hooks/problemCounts";
import { type AppliedChange, type LocalFile, SCRATCH_PROJECT_KEY } from "@/lib/github";
import { applyRemoteChanges, toSyncFiles, workspaceFromSyncFiles } from "@/lib/githubWorkspace";
import { getLanguageById, getLanguagesByGroup, detectLanguageFromFilename, detectNeedsStdin } from "@/lib/languages";
import { FileTab, createFile, downloadFile } from "@/lib/fileSystem";
import {
  type ActionResult,
  findPathConflict,
  makeUniquePath,
  planFileRename,
  planFolderRename,
  planNewFile,
  planNewFolder,
  replaceExtension,
  validateEntryName,
} from "@/lib/fileNames";
import {
  FORK_STORAGE_KEY,
  type WorkspaceState,
  addFile,
  addFiles,
  appendFiles,
  clearWorkspace,
  closeTab,
  emptyWorkspace,
  foldersOf,
  hasStoredWorkspace,
  importFiles,
  isWorkspaceEmpty,
  loadWorkspace,
  openFile,
  readExternalWorkspaceSource,
  removeFile,
  removeFolder,
  renameFolder,
  saveWorkspace,
  workspaceSignature,
} from "@/lib/workspace";
import { DEFAULT_EDITOR_SETTINGS, updateEditorSettings, useEditorSettings } from "@/lib/editorSettings";
import { RUN_MESSAGES, executeCode } from "@/lib/pistonApi";
import { runResultToLines, runStartLine, type RunLine } from "@/lib/run/format";
import type { Problem } from "@/lib/run/problems";
import { loadSharedCode, loadSharedProject, clearUrlParams } from "@/lib/sharing";
import { recordSnapshot } from "@/lib/timelineStorage";
import { useAuth } from "@/contexts/AuthContext";
import { createProject, updateProject, getProject } from "@/lib/projectStorage";
import { toast } from "sonner";

type TerminalLine = RunLine;

const SCRATCH_AUTOSAVE_MS = 500;

/** Every language in picker order, for the palette's "Change language" list. */
const PALETTE_LANGUAGES = getLanguagesByGroup().flatMap((g) =>
  g.languages.map((l) => ({ id: l.id, label: l.label, extension: l.extension }))
);

/** True when a key event comes from a text field outside the code editor (Monaco handles its own keys). */
function isTypingOutsideEditor(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".monaco-editor")) return false;
  return target.isContentEditable || !!target.closest("input, textarea, select, [contenteditable='true']");
}

/** Below 768px the sidebar overlaps most of the editor. Safe without matchMedia (jsdom, SSR). */
function isNarrowScreen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(min-width: 768px)").matches;
}

/** True when the event happened inside an open dialog or menu (their keys belong to them). */
function isInsideOverlay(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']");
}

/**
 * Statically scan source code + runtime output to find files
 * that the user's program creates, so we can add them to the Explorer.
 */
function detectCreatedFiles(
  code: string,
  langId: string,
  output: string[]
): { name: string; langId: string; content: string }[] {
  const found: { name: string; langId: string; content: string }[] = [];

  const add = (name: string) => {
    if (!name || name.includes("/") || name.includes("\\")) return;
    if (found.find((f) => f.name === name)) return;
    // Always empty — the user's code writes the real content
    found.push({ name, langId: detectLanguageFromFilename(name).id, content: "" });
  };

  // ── Python ─────────────────────────────────────────────────────────────────
  if (langId === "python") {
    // Build a map of simple string-variable assignments: x = "value"
    const varMap: Record<string, string> = {};
    const varAssign = /^[ \t]*(\w+)\s*=\s*(["'`])((?:(?!\2).)*?)\2/gm;
    let m: RegExpExecArray | null;
    while ((m = varAssign.exec(code)) !== null) varMap[m[1]] = m[3];

    // open("filename", ["w","a","x",...]) — direct string
    const directOpen = /open\s*\(\s*(["'])((?:(?!\1).)+?)\1\s*,\s*["'][waxWAX]/g;
    while ((m = directOpen.exec(code)) !== null) add(m[2]);

    // open(varName, ["w","a","x",...]) — variable name
    const varOpen = /open\s*\(\s*(\w+)\s*,\s*["'][waxWAX]/g;
    while ((m = varOpen.exec(code)) !== null) {
      const resolved = varMap[m[1]];
      if (resolved) add(resolved);
    }

    // csv / pandas: df.to_csv("file.csv")
    const csvMatch = /\.to_csv\s*\(\s*(["'])((?:(?!\1).)+?)\1/g;
    while ((m = csvMatch.exec(code)) !== null) add(m[2]);

    // json.dump / json.dumps to file
    const jsonDump = /json\.dump\s*\(.*?open\s*\(\s*(["'])((?:(?!\1).)+?)\1/g;
    while ((m = jsonDump.exec(code)) !== null) add(m[2]);
  }

  // ── JavaScript / TypeScript ────────────────────────────────────────────────
  if (langId === "javascript" || langId === "typescript") {
    let m: RegExpExecArray | null;
    const fsWrite = /writeFile(?:Sync)?\s*\(\s*(["'`])((?:(?!\1).)+?)\1/g;
    while ((m = fsWrite.exec(code)) !== null) add(m[2]);
    const fsAppend = /appendFile(?:Sync)?\s*\(\s*(["'`])((?:(?!\1).)+?)\1/g;
    while ((m = fsAppend.exec(code)) !== null) add(m[2]);
  }

  // ── R ──────────────────────────────────────────────────────────────────────
  if (langId === "r") {
    let m: RegExpExecArray | null;
    const rWrite = /write(?:\.csv)?\s*\(.*?,\s*["']((?:[^"']+\.\w+))[",]/g;
    while ((m = rWrite.exec(code)) !== null) add(m[1]);
  }

  // ── Output-based detection (any language) ─────────────────────────────────
  // Matches: File 'foo.txt' created/written/saved  etc.
  const outPatterns = [
    /[Ff]ile\s+["']([^"']+\.[a-z]{1,5})["']\s+(?:created|written|saved|saved successfully)/,
    /[Ww]rote?\s+(?:to\s+)?["']([^"']+\.[a-z]{1,5})["']/,
    /[Ss]aved?\s+(?:to\s+)?["']([^"']+\.[a-z]{1,5})["']/,
    /[Cc]reated?\s+["']([^"']+\.[a-z]{1,5})["']/,
  ];
  for (const line of output) {
    for (const pat of outPatterns) {
      const m = line.match(pat);
      if (m) add(m[1]);
    }
  }

  return found;
}

interface ForkPayload {
  name?: string;
  files?: { fileName: string; language?: string; code: string }[];
}

const Index = () => {
  const { user, profile, loading, signInWithZuup } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { settings } = useEditorSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Enforce authentication for accessing the code editor
  useEffect(() => {
    if (!loading && !user) {
      const redirectPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirectPath}`;
    }
  }, [user, loading]);

  // ── Boot: restore the scratch workspace unless the URL asks for something specific ──
  const [boot] = useState(() => {
    const external = readExternalWorkspaceSource();
    return { external, restored: external ? null : loadWorkspace() };
  });

  // Workspace (files, folders, tabs) lives in one object mirrored into a ref, so event handlers
  // always read the latest state and never run side effects inside state updaters.
  const [ws, setWs] = useState<WorkspaceState>(() =>
    boot.restored
      ? {
          files: boot.restored.files,
          folders: boot.restored.folders,
          activeFileId: boot.restored.activeFileId,
          openTabIds: boot.restored.openTabIds,
        }
      : emptyWorkspace()
  );
  const wsRef = useRef<WorkspaceState>(ws);
  const commitWorkspace = useCallback((next: WorkspaceState) => {
    wsRef.current = next;
    setWs(next);
  }, []);
  const updateWorkspace = useCallback(
    (fn: (state: WorkspaceState) => WorkspaceState) => commitWorkspace(fn(wsRef.current)),
    [commitWorkspace]
  );

  const { files, folders, activeFileId, openTabIds } = ws;
  const activeFile = useMemo(() => files.find((f) => f.id === activeFileId) ?? null, [files, activeFileId]);
  const tabFiles = useMemo(
    () => openTabIds.map((id) => files.find((f) => f.id === id)).filter((f): f is FileTab => !!f),
    [files, openTabIds]
  );

  // Language used when there is no active file (picker + extension for extension-less names)
  const [fallbackLangId, setFallbackLangId] = useState(
    () => boot.restored?.files.find((f) => f.id === boot.restored?.activeFileId)?.languageId ?? "python"
  );
  const activeFileLanguageId = activeFile?.languageId;
  useEffect(() => {
    if (activeFileLanguageId) setFallbackLangId(activeFileLanguageId);
  }, [activeFileLanguageId]);
  const defaultLanguageId = activeFile?.languageId ?? fallbackLangId;
  const defaultLangRef = useRef(defaultLanguageId);
  defaultLangRef.current = defaultLanguageId;
  const activeLanguage = getLanguageById(defaultLanguageId);

  // Program standard input (stdin) for scanf, cin, input(), etc.
  const [programStdin, setProgramStdin] = useState("");
  const [stdinRequestTrigger, setStdinRequestTrigger] = useState(0);

  // Cloud project state
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(boot.restored?.projectName ?? null);
  const [isSaving, setIsSaving] = useState(false);
  // A restored scratch workspace has never been saved to a project.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(() => (boot.restored?.files.length ?? 0) > 0);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  // Refs to avoid stale closures in timers and async callbacks
  const userRef = useRef(user);
  const cloudProjectIdRef = useRef<string | null>(null);
  const projectNameRef = useRef(projectName);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedProjectIdRef = useRef<string | null>(null);
  // While the URL points at a project/share/fork that has not loaded yet, never overwrite the scratch copy.
  const autosaveBlockedRef = useRef(boot.external);
  const storageWarnedRef = useRef(false);
  // True while the scratch workspace could not be written to browser storage (leaving would lose it).
  const [scratchUnsafe, setScratchUnsafe] = useState(false);
  // GitHub link operations, for handlers declared before the sync hook.
  const githubRef = useRef<Pick<GitHubSync, "rekey" | "forget"> | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);

  const setCloudProject = useCallback((id: string | null) => {
    cloudProjectIdRef.current = id;
    setCloudProjectId(id);
  }, []);

  /** Keeps ?project=<id> in the URL so a refresh reopens the same project. */
  const syncProjectParam = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("project", id);
          else next.delete("project");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // ── Cloud / guest-project saving ──
  /** `quiet` saves (auto-save, save before run) only speak up when something goes wrong. */
  const performCloudSave = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!userRef.current) return;
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);

    const snapshotFiles = wsRef.current.files;
    const snapshotSignature = workspaceSignature(snapshotFiles);
    const currentCloudId = cloudProjectIdRef.current;
    const projectFiles = snapshotFiles.map((f) => ({ name: f.name, language: f.languageId, content: f.content }));
    const primaryLang = snapshotFiles[0]?.languageId || defaultLangRef.current;
    let succeeded = false;

    try {
      if (currentCloudId) {
        const updated = await updateProject(currentCloudId, { files: projectFiles, language: primaryLang });
        if (updated) {
          succeeded = true;
          if (!opts.quiet) toast.success("Saved");
        } else {
          toast.error("Could not save. Your changes are still in the editor; try saving again.");
        }
      } else {
        const name = projectNameRef.current || snapshotFiles[0]?.name || "Untitled";
        const created = await createProject(name, "", primaryLang, projectFiles);
        if (created) {
          succeeded = true;
          // A scratch workspace linked to GitHub keeps its link (and sync base) as a project.
          githubRef.current?.rekey(SCRATCH_PROJECT_KEY, created.id);
          setCloudProject(created.id);
          setProjectName(created.name);
          projectNameRef.current = created.name;
          loadedProjectIdRef.current = created.id;
          clearWorkspace();
          syncProjectParam(created.id);
          toast.success("Saved as a new project");
        } else {
          toast.error("Could not create the project. Your changes are still in the editor; try saving again.");
        }
      }
    } catch (err) {
      console.error("Cloud save error:", err);
      toast.error("Could not save. Check your connection and save again.");
    }

    if (succeeded) {
      // Only clear the "unsaved" markers when nothing changed while the request was in flight.
      if (workspaceSignature(wsRef.current.files) === snapshotSignature) {
        commitWorkspace({ ...wsRef.current, files: wsRef.current.files.map((f) => (f.isDirty ? { ...f, isDirty: false } : f)) });
        setHasUnsavedChanges(false);
      } else {
        pendingSaveRef.current = true;
      }
    }

    isSavingRef.current = false;
    setIsSaving(false);
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      void performCloudSave({ quiet: true });
    }
  }, [commitWorkspace, setCloudProject, syncProjectParam]);

  const scheduleCloudAutosave = useCallback(() => {
    if (!cloudProjectIdRef.current || !userRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const delay = settingsRef.current.autoSaveDelay;
    if (delay <= 0) return; // Auto-save is off: Ctrl/Cmd+S saves.
    autoSaveTimer.current = setTimeout(() => {
      void performCloudSave({ quiet: true });
    }, delay);
  }, [performCloudSave]);

  /** Call after any change to files/folders so "unsaved" state and cloud auto-save stay correct. */
  const markChanged = useCallback(() => {
    setHasUnsavedChanges(true);
    scheduleCloudAutosave();
  }, [scheduleCloudAutosave]);

  // Leaving the editor inside the app (dashboard link, "Go to dashboard") does not fire beforeunload,
  // so save a cloud project's pending changes on the way out instead of dropping them.
  const performCloudSaveRef = useRef(performCloudSave);
  performCloudSaveRef.current = performCloudSave;
  useEffect(
    () => () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (cloudProjectIdRef.current && hasUnsavedChangesRef.current) {
        void performCloudSaveRef.current({ quiet: true });
      }
    },
    []
  );

  // ── GitHub sync ──
  // Workspace file names are project-relative paths, so they map 1:1 onto the synced files.
  const getSyncFiles = useCallback(() => toSyncFiles(wsRef.current.files), []);
  const applyRemoteFromGitHub = useCallback(
    (remoteFiles: LocalFile[], changes: AppliedChange[]) => {
      const result = applyRemoteChanges(wsRef.current, remoteFiles, changes, { markDirty: !!cloudProjectIdRef.current });
      commitWorkspace(result.state);
      markChanged();
    },
    [commitWorkspace, markChanged]
  );
  const replaceFilesFromGitHub = useCallback(
    (remoteFiles: LocalFile[]) => {
      commitWorkspace(workspaceFromSyncFiles(remoteFiles, { markDirty: !!cloudProjectIdRef.current }));
      markChanged();
    },
    [commitWorkspace, markChanged]
  );
  // Lets the editor dispose Monaco models of deleted files.
  const liveFileIds = useMemo(() => files.map((f) => f.id), [files]);

  const github = useGitHubSync({
    projectKey: cloudProjectId ?? SCRATCH_PROJECT_KEY,
    enabled: !!user,
    getFiles: getSyncFiles,
    filesVersion: files,
    onRemoteApplied: applyRemoteFromGitHub,
    onReplaceFiles: replaceFilesFromGitHub,
  });
  githubRef.current = github;

  // ── Scratch workspace autosave (localStorage) ──
  const persistScratch = useCallback(() => {
    if (autosaveBlockedRef.current || cloudProjectIdRef.current) return;
    const state = wsRef.current;
    // Don't create a storage entry for a pristine, never-used workspace.
    if (isWorkspaceEmpty(state) && !hasStoredWorkspace()) return;
    const ok = saveWorkspace(state, projectNameRef.current);
    setScratchUnsafe(!ok);
    if (!ok && !storageWarnedRef.current) {
      storageWarnedRef.current = true;
      toast.warning("Couldn't keep a local copy of your work", {
        description: "Browser storage is full or blocked. Download your files or save to a project.",
      });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(persistScratch, SCRATCH_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [ws, projectName, cloudProjectId, persistScratch]);

  // Flush immediately when the tab is hidden or closed so the last keystrokes are never lost.
  useEffect(() => {
    const flush = () => persistScratch();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistScratch]);

  // ── Load a project when ?project=<id> is in the URL ──
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (!projectId || !user) return;
    if (loadedProjectIdRef.current === projectId || cloudProjectIdRef.current === projectId) return;
    loadedProjectIdRef.current = projectId;
    autosaveBlockedRef.current = true;

    getProject(projectId)
      .then((project) => {
        if (loadedProjectIdRef.current !== projectId) return; // a newer navigation took over
        if (!project) {
          toast.error("Couldn't open that project", { description: "It may have been deleted or isn't available." });
          loadedProjectIdRef.current = null;
          autosaveBlockedRef.current = false;
          syncProjectParam(null);
          const scratch = loadWorkspace();
          if (scratch && isWorkspaceEmpty(wsRef.current)) {
            commitWorkspace({
              files: scratch.files,
              folders: scratch.folders,
              activeFileId: scratch.activeFileId,
              openTabIds: scratch.openTabIds,
            });
            setProjectName(scratch.projectName);
            setHasUnsavedChanges(scratch.files.length > 0);
          }
          return;
        }
        const loadedFiles = importFiles(
          project.files.map((f) => ({ name: f.name, content: f.content, languageId: f.language }))
        );
        const first = loadedFiles[0];
        commitWorkspace({
          files: loadedFiles,
          folders: foldersOf(loadedFiles),
          activeFileId: first?.id ?? "",
          openTabIds: first ? [first.id] : [],
        });
        setCloudProject(project.id);
        setProjectName(project.name);
        projectNameRef.current = project.name;
        setHasUnsavedChanges(false);
        clearWorkspace();
        githubRef.current?.forget(SCRATCH_PROJECT_KEY);
        toast.success(`Opened "${project.name}"`);
      })
      .catch((err) => {
        console.error("Failed to open project:", err);
        if (loadedProjectIdRef.current === projectId) {
          loadedProjectIdRef.current = null;
          autosaveBlockedRef.current = false;
        }
        toast.error("Couldn't open that project");
      });
  }, [searchParams, user, commitWorkspace, setCloudProject, syncProjectParam]);

  // Open New Project modal when navigated from Dashboard with ?new=true
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setNewProjectOpen(true);
      // Clean the URL param
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // UI state
  const runner = useRunController();
  const { isRunning } = runner;
  // Lines pushed into the terminal after execution
  const [terminalExternalLines, setTerminalExternalLines] = useState<TerminalLine[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands");
  // Problems the editor's language services report for the open file (type errors and the like).
  const [editorProblems, setEditorProblems] = useState<{ errors: number; warnings: number } | null>(null);
  const [panelRequest, setPanelRequest] = useState<{ tab: PanelTab; nonce: number }>();
  const [revealPosition, setRevealPosition] = useState<{ line: number; column?: number; nonce: number } | null>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  /** Runs and input prompts happen in the terminal, so never leave it collapsed when one starts. */
  const revealTerminal = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (panel?.isCollapsed()) panel.expand();
    setPanelRequest({ tab: "terminal", nonce: Date.now() });
  }, []);

  const openSettings = useCallback((section?: SettingsSection) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);
  const openPalette = useCallback((mode: PaletteMode) => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);

  // VS Code Layout State
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("explorer");
  // Closed on phones, where a 240px panel would leave the editor about 100px wide.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrowScreen());
  const [inlineCreateTrigger, setInlineCreateTrigger] = useState(0);
  const [newFileRequested, setNewFileRequested] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });

  /** Opens the Explorer and starts an inline "new file" input. */
  const requestNewFile = useCallback(() => {
    setSidebarOpen(true);
    setActiveSidebarTab("explorer");
    setNewFileRequested(true);
  }, []);
  // Fire the trigger once the Explorer is actually on screen, so the input always receives it.
  useEffect(() => {
    if (newFileRequested && sidebarOpen && activeSidebarTab === "explorer") {
      setInlineCreateTrigger((n) => n + 1);
      setNewFileRequested(false);
    }
  }, [newFileRequested, sidebarOpen, activeSidebarTab]);

  // Check for forked project / shared code / shared project on mount
  useEffect(() => {
    // Check for forked project from ShareView
    try {
      const forkRaw = localStorage.getItem(FORK_STORAGE_KEY);
      if (forkRaw) {
        const forkData = JSON.parse(forkRaw) as ForkPayload;
        localStorage.removeItem(FORK_STORAGE_KEY);
        if (forkData && Array.isArray(forkData.files) && forkData.files.length > 0) {
          const newFiles = importFiles(
            forkData.files.map((f) => ({ name: f.fileName, content: f.code, languageId: f.language }))
          );
          commitWorkspace({
            files: newFiles,
            folders: foldersOf(newFiles),
            activeFileId: newFiles[0].id,
            openTabIds: [newFiles[0].id],
          });
          setProjectName(forkData.name || "Forked Project");
          setHasUnsavedChanges(true);
          githubRef.current?.forget(SCRATCH_PROJECT_KEY);
          autosaveBlockedRef.current = false;
          toast.success("Forked project loaded in Zuup Code");
          return;
        }
      }
    } catch (e) {
      console.warn("Error loading fork project:", e);
    }

    const sharedCode = loadSharedCode();
    if (sharedCode) {
      const [sharedFile] = importFiles([
        { name: sharedCode.fileName, content: sharedCode.code, languageId: sharedCode.language },
      ]);
      commitWorkspace({ files: [sharedFile], folders: [], activeFileId: sharedFile.id, openTabIds: [sharedFile.id] });
      setHasUnsavedChanges(true);
      githubRef.current?.forget(SCRATCH_PROJECT_KEY);
      autosaveBlockedRef.current = false;
      clearUrlParams();
      toast.success(`Loaded shared code: ${sharedFile.name}`);
      return;
    }

    const sharedProject = loadSharedProject();
    if (sharedProject) {
      const projectFiles = importFiles(
        sharedProject.files.map((file) => ({ name: file.fileName, content: file.code, languageId: file.language }))
      );
      const mainFile = projectFiles.find((f) => f.name === sharedProject.mainFileName) || projectFiles[0];
      commitWorkspace({
        files: projectFiles,
        folders: foldersOf(projectFiles),
        activeFileId: mainFile?.id ?? "",
        openTabIds: mainFile ? [mainFile.id] : [],
      });
      if (sharedProject.name) setProjectName(sharedProject.name);
      setHasUnsavedChanges(true);
      githubRef.current?.forget(SCRATCH_PROJECT_KEY);
      autosaveBlockedRef.current = false;
      clearUrlParams();
      toast.success(`Loaded shared project: ${sharedProject.name}`, {
        description: `${projectFiles.length} files loaded`,
      });
      return;
    }

    // Nothing external was found: the scratch workspace (restored or blank) is the source of truth.
    if (!new URLSearchParams(window.location.search).get("project")) {
      autosaveBlockedRef.current = false;
    }
  }, [commitWorkspace]);

  // ── File & folder operations ──
  const createEmptyFile = useCallback(
    (path: string, languageId: string): FileTab => {
      const file = createFile(path, languageId, "");
      if (cloudProjectIdRef.current) file.isDirty = true;
      updateWorkspace((s) => addFile(s, file));
      markChanged();
      recordSnapshot(file.id, file.name, "", "Created");
      toast.success(`Created ${path}`);
      return file;
    },
    [markChanged, updateWorkspace]
  );

  const handleNewFile = useCallback(
    (rawName: string, parentFolder: string): ActionResult => {
      const plan = planNewFile(rawName, parentFolder, defaultLangRef.current, wsRef.current);
      if (plan.ok === false) {
        toast.error(plan.error);
        return plan;
      }
      createEmptyFile(plan.path, plan.languageId);
      return { ok: true };
    },
    [createEmptyFile]
  );

  /** Empty-state quick pick: a blank main.<ext> (or the next free name) for the language. */
  const handleCreateWithLanguage = useCallback(
    (languageId: string) => {
      const lang = getLanguageById(languageId);
      const path = makeUniquePath(`main${lang.extension}`, wsRef.current);
      createEmptyFile(path, detectLanguageFromFilename(path).id);
    },
    [createEmptyFile]
  );

  const handleCreateFolder = useCallback(
    (rawName: string, parentFolder: string): ActionResult => {
      const plan = planNewFolder(rawName, parentFolder, wsRef.current);
      if (plan.ok === false) {
        toast.error(plan.error);
        return plan;
      }
      updateWorkspace((s) => ({
        ...s,
        folders: Array.from(new Set([...s.folders, ...plan.parentFolders, plan.path])),
      }));
      markChanged();
      toast.success(`Created folder "${plan.path}"`);
      return { ok: true };
    },
    [markChanged, updateWorkspace]
  );

  /** Puts previously deleted files/folders back (Undo). Name clashes get a numeric suffix. */
  const restoreEntries = useCallback(
    (restoredFiles: FileTab[], restoredFolders: string[], reopenIds: string[]) => {
      let state = wsRef.current;
      for (const file of restoredFiles) {
        if (state.files.some((f) => f.id === file.id)) continue;
        const name = makeUniquePath(file.name, state);
        state = reopenIds.includes(file.id)
          ? addFile(state, { ...file, name })
          : appendFiles(state, [{ ...file, name }]);
      }
      state = { ...state, folders: Array.from(new Set([...state.folders, ...restoredFolders])) };
      commitWorkspace(state);
      markChanged();
    },
    [commitWorkspace, markChanged]
  );

  const handleDeleteFile = useCallback(
    (id: string) => {
      const file = wsRef.current.files.find((f) => f.id === id);
      if (!file) return;
      const wasOpen = wsRef.current.openTabIds.includes(id);
      updateWorkspace((s) => removeFile(s, id));
      markChanged();
      toast(`Deleted ${file.name}`, {
        duration: 8000,
        action: { label: "Undo", onClick: () => restoreEntries([file], [], wasOpen ? [id] : []) },
      });
    },
    [markChanged, restoreEntries, updateWorkspace]
  );

  const handleDeleteFolder = useCallback(
    (folderPath: string) => {
      const before = wsRef.current;
      const removedFiles = before.files.filter((f) => f.name.startsWith(`${folderPath}/`));
      const removedFolders = before.folders.filter((f) => f === folderPath || f.startsWith(`${folderPath}/`));
      const reopen = removedFiles.filter((f) => before.openTabIds.includes(f.id)).map((f) => f.id);
      updateWorkspace((s) => removeFolder(s, folderPath));
      markChanged();
      const count = removedFiles.length;
      toast(`Deleted folder "${folderPath}"${count > 0 ? ` and ${count} file${count > 1 ? "s" : ""}` : ""}`, {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => restoreEntries(removedFiles, [folderPath, ...removedFolders], reopen),
        },
      });
    },
    [markChanged, restoreEntries, updateWorkspace]
  );

  const handleRenameFile = useCallback(
    (id: string, newName: string): ActionResult => {
      const plan = planFileRename(id, newName, wsRef.current);
      if (plan.ok === false) {
        toast.error(plan.error);
        return plan;
      }
      if (!plan.changed) return { ok: true };
      updateWorkspace((s) => ({
        ...s,
        files: s.files.map((f) =>
          f.id === id ? { ...f, name: plan.path, languageId: detectLanguageFromFilename(plan.path).id, isDirty: true } : f
        ),
      }));
      markChanged();
      toast.success(`Renamed to ${newName}`);
      return { ok: true };
    },
    [markChanged, updateWorkspace]
  );

  const handleRenameFolder = useCallback(
    (folderPath: string, newName: string): ActionResult => {
      const plan = planFolderRename(folderPath, newName, wsRef.current);
      if (plan.ok === false) {
        toast.error(plan.error);
        return plan;
      }
      if (!plan.changed) return { ok: true };
      updateWorkspace((s) => renameFolder(s, folderPath, plan.path));
      markChanged();
      toast.success(`Renamed folder to "${newName}"`);
      return { ok: true };
    },
    [markChanged, updateWorkspace]
  );

  const handleSelectFile = useCallback((id: string) => updateWorkspace((s) => openFile(s, id)), [updateWorkspace]);
  /** Opening a file from the explorer on a phone hides the explorer so the file is visible. */
  const handleSelectFileFromSidebar = useCallback(
    (id: string) => {
      handleSelectFile(id);
      if (isNarrowScreen()) setSidebarOpen(false);
    },
    [handleSelectFile]
  );
  const handleCloseTab = useCallback((id: string) => updateWorkspace((s) => closeTab(s, id)), [updateWorkspace]);

  const updateFileContent = useCallback(
    (content: string) => {
      const id = wsRef.current.activeFileId;
      const current = wsRef.current.files.find((f) => f.id === id);
      if (!current || current.content === content) return;
      updateWorkspace((s) => ({
        ...s,
        files: s.files.map((f) => (f.id === id ? { ...f, content, isDirty: true } : f)),
      }));
      markChanged();
    },
    [markChanged, updateWorkspace]
  );

  const handleLanguageChange = useCallback(
    (langId: string) => {
      const lang = getLanguageById(langId);
      const current = wsRef.current.files.find((f) => f.id === wsRef.current.activeFileId);
      if (!current) {
        // No file open: the picker only chooses the language for the next new file.
        setFallbackLangId(lang.id);
        return;
      }
      if (current.languageId === lang.id) return;
      const newPath = replaceExtension(current.name, lang.extension);
      if (newPath !== current.name) {
        const conflict = findPathConflict(newPath, wsRef.current, { kind: "file", ignoreFileId: current.id });
        if (conflict) {
          toast.error(`Can't switch to ${lang.label}`, { description: conflict });
          return;
        }
      }
      updateWorkspace((s) => ({
        ...s,
        files: s.files.map((f) => (f.id === current.id ? { ...f, languageId: lang.id, name: newPath, isDirty: true } : f)),
      }));
      markChanged();
    },
    [markChanged, updateWorkspace]
  );

  // Upload files into the current workspace
  const handleUploadFiles = useCallback(
    (uploaded: { name: string; content: string }[]) => {
      const created = importFiles(uploaded, wsRef.current);
      if (created.length === 0) return;
      if (cloudProjectIdRef.current) created.forEach((f) => { f.isDirty = true; });
      updateWorkspace((s) => addFiles(s, created));
      markChanged();
      toast.success(`Added ${created.length} file${created.length > 1 ? "s" : ""}`);
    },
    [markChanged, updateWorkspace]
  );

  const handleRestoreSnapshot = useCallback(
    (content: string) => {
      if (!activeFile) {
        toast.error("Open a file to restore a version into it.");
        return;
      }
      updateFileContent(content);
      recordSnapshot(activeFile.id, activeFile.name, content, "Restored");
      toast.success(`Restored version of ${activeFile.name}`);
    },
    [activeFile, updateFileContent]
  );

  const handleNewProject = useCallback(
    async (data: NewProjectData) => {
      let projectFiles: FileTab[];
      if (data.uploadedFiles.length > 0) {
        projectFiles = importFiles(data.uploadedFiles);
      } else {
        // Blank project: one empty main.<ext>, no demo code.
        const lang = getLanguageById(data.language);
        projectFiles = [createFile(`main${lang.extension}`, lang.id, "")];
      }
      const first = projectFiles[0];

      // The new project replaces the scratch workspace and any open cloud project.
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      pendingSaveRef.current = false;
      loadedProjectIdRef.current = null;
      setCloudProject(null);
      syncProjectParam(null);
      commitWorkspace({
        files: projectFiles,
        folders: foldersOf(projectFiles),
        activeFileId: first?.id ?? "",
        openTabIds: first ? [first.id] : [],
      });
      setProjectName(data.name);
      projectNameRef.current = data.name;
      setHasUnsavedChanges(false);
      setTerminalExternalLines([]);
      clearWorkspace();
      githubRef.current?.forget(SCRATCH_PROJECT_KEY);

      // Save to cloud immediately if signed in
      if (userRef.current) {
        const saved = await createProject(
          data.name,
          data.description,
          data.language,
          projectFiles.map((f) => ({ name: f.name, language: f.languageId, content: f.content }))
        );
        if (saved) {
          loadedProjectIdRef.current = saved.id;
          setCloudProject(saved.id);
          clearWorkspace();
          syncProjectParam(saved.id);
          toast.success(`Created "${data.name}" and saved to the cloud`);
        } else {
          toast.success(`Created "${data.name}"`, { description: "Could not save to cloud" });
        }
      } else {
        toast.success(`Created "${data.name}"`, { description: "Sign in to save to cloud" });
      }
    },
    [commitWorkspace, setCloudProject, syncProjectParam]
  );

  const handleSave = useCallback(() => {
    if (!userRef.current) {
      toast.error("You must be logged in with your Zuup Account to save code.", {
        action: {
          label: "Sign in with Zuup",
          onClick: () => signInWithZuup(window.location.pathname + window.location.search),
        },
      });
      return;
    }
    if (wsRef.current.files.length === 0 && !cloudProjectIdRef.current) {
      toast.info("Nothing to save yet", { description: "Create a file first." });
      return;
    }
    const current = wsRef.current.files.find((f) => f.id === wsRef.current.activeFileId);
    if (current) recordSnapshot(current.id, current.name, current.content, "Saved");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    void performCloudSave();
  }, [signInWithZuup, performCloudSave]);

  const handleDownload = useCallback(() => {
    if (!activeFile) {
      toast.info("Open a file to download it.");
      return;
    }
    downloadFile(activeFile.name, activeFile.content);
    toast.success(`Downloaded ${activeFile.name}`);
  }, [activeFile]);

  const handleShare = useCallback(() => {
    if (!activeFile) {
      toast.info("Open a file to share it.");
      return;
    }
    setShareModalOpen(true);
  }, [activeFile]);

  /** Adds files the program created (found by scanning code/output) without stealing focus. */
  const addCreatedFiles = useCallback(
    (created: { name: string; langId: string; content: string }[]) => {
      const fresh = created.filter(
        (cf) => validateEntryName(cf.name).ok && !findPathConflict(cf.name, wsRef.current, { kind: "file" })
      );
      if (fresh.length === 0) return;
      const newFiles = fresh.map((cf) => {
        const file = createFile(cf.name, cf.langId, cf.content);
        if (cloudProjectIdRef.current) file.isDirty = true;
        return file;
      });
      updateWorkspace((s) => appendFiles(s, newFiles));
      markChanged();
      toast.success(
        `${newFiles.length === 1 ? `"${newFiles[0].name}"` : `${newFiles.length} files`} added to Explorer`,
        { description: "Created by your code" }
      );
    },
    [markChanged, updateWorkspace]
  );

  /**
   * Runs the active file and streams the result into the terminal. The file is read from the
   * workspace ref at call time, so a run started right after switching files runs the new file.
   */
  const executeActiveFile = useCallback(
    async (stdin?: string) => {
      const file = wsRef.current.files.find((f) => f.id === wsRef.current.activeFileId);
      if (!file) return;
      if (runner.isBusy()) {
        toast.info("A run is already going", { description: "Stop it or wait for it to finish, then run again." });
        return;
      }
      const lang = getLanguageById(file.languageId);

      if (!lang.pistonLang) {
        setTerminalExternalLines([
          { text: `${lang.label} can't be run here. It is available for editing and syntax highlighting only.`, type: "warning" },
        ]);
        return;
      }

      const initialLines: TerminalLine[] = [runStartLine(file.name, lang.label)];
      const stdinToPass = stdin && stdin.trim() ? stdin : undefined;
      if (stdinToPass) {
        initialLines.push({ text: `Input: ${stdinToPass.trim().replace(/\n/g, " ")}`, type: "info" });
      }
      revealTerminal();
      setTerminalExternalLines(initialLines);
      recordSnapshot(file.id, file.name, file.content, "Code Run");

      const outcome = await runner.start(async (signal) => {
        try {
          return await executeCode(lang.pistonLang!, lang.pistonVersion, file.content, stdinToPass, {
            signal,
            fileName: file.name,
          });
        } catch (err) {
          console.error("Execution error:", err);
          return null;
        }
      });
      if (outcome.status !== "done") return;
      const result = outcome.value;
      if (!result) {
        setTerminalExternalLines([{ text: RUN_MESSAGES.network, type: "error" }]);
        return;
      }

      const resultLines: TerminalLine[] = runResultToLines(result);
      // The program stopped because it wanted input that was never given: ask for it in the terminal.
      const wantedInput = /EOFError|EOF when reading|NoSuchElementException/.test(`${result.stderr}\n${result.stdout}`);
      if (!stdinToPass && result.outcome === "runtime-error" && wantedInput) {
        resultLines.push({ text: "The program is waiting for input. Type it below and press Enter to run again.", type: "stdin-prompt" });
        setStdinRequestTrigger(Date.now());
      }
      setTerminalExternalLines(resultLines);

      if (result.success) {
        addCreatedFiles(detectCreatedFiles(file.content, file.languageId, result.stdout ? result.stdout.split("\n") : result.output));
      }
    },
    [addCreatedFiles, runner, revealTerminal]
  );

  /** Stops the current run. The runner reports it as cancelled and the terminal says so. */
  const handleStop = runner.stop;

  const handleRun = useCallback(
    async (customStdin?: unknown) => {
      const file = wsRef.current.files.find((f) => f.id === wsRef.current.activeFileId);
      if (!file) {
        toast.info("Create or open a file to run it.");
        return;
      }
      if (runner.isBusy()) {
        toast.info("A run is already going", { description: "Stop it or wait for it to finish, then run again." });
        return;
      }

      if (file.languageId === "html" || file.languageId === "css") {
        setTerminalExternalLines([{ text: "Rendered in the preview panel.", type: "success" }]);
        return;
      }

      if (settingsRef.current.saveBeforeRun && cloudProjectIdRef.current && userRef.current) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        void performCloudSave({ quiet: true });
      }

      // Only a string is stdin; a click handler may pass a mouse event.
      const stdinArg: string | undefined = typeof customStdin === "string" ? customStdin : undefined;
      const lang = getLanguageById(file.languageId);
      const needsStdin = detectNeedsStdin(file.content, file.languageId);

      // The program reads input and none was given yet: collect it in the terminal first.
      if (needsStdin && stdinArg === undefined && !programStdin.trim()) {
        revealTerminal();
        setTerminalExternalLines([
          runStartLine(file.name, lang.label),
          { text: "This program reads input. Type it below and press Enter to run (Shift+Enter adds a line).", type: "stdin-prompt" },
        ]);
        setStdinRequestTrigger(Date.now());
        return;
      }

      await executeActiveFile(stdinArg !== undefined ? stdinArg : programStdin);
    },
    [programStdin, executeActiveFile, performCloudSave, runner, revealTerminal]
  );

  const handleClearOutput = useCallback(() => {
    setTerminalExternalLines([{ text: "Terminal cleared.", type: "info" }]);
  }, []);

  const handleTerminalCommand = useCallback(
    async (cmd: string) => {
      const file = wsRef.current.files.find((f) => f.id === wsRef.current.activeFileId);
      if (!file) {
        setTerminalExternalLines([{ text: "No file is open. Create or open a file first.", type: "error" }]);
        return;
      }

      // Plain "run" — run the active file, output stays in Terminal tab
      if (cmd === "run") {
        if (file.languageId === "html" || file.languageId === "css") {
          setTerminalExternalLines([{ text: "Rendered in the preview panel.", type: "success" }]);
          return;
        }
        await executeActiveFile();
        return;
      }

      // "run-with-stdin:<b64stdin>" — execute active file with captured stdin
      if (cmd.startsWith("run-with-stdin:")) {
        if (!getLanguageById(file.languageId).pistonLang) {
          setTerminalExternalLines([{ text: "This language can't be run here.", type: "error" }]);
          return;
        }
        const b64stdin = cmd.slice("run-with-stdin:".length);
        let stdin = "";
        try {
          stdin = decodeURIComponent(escape(atob(b64stdin)));
        } catch {
          stdin = b64stdin;
        }
        setProgramStdin(stdin);
        await executeActiveFile(stdin);
      }
    },
    [executeActiveFile]
  );

  /** A problem in the terminal was clicked: open its file (when it names one) and jump to the line. */
  const handleRevealProblem = useCallback(
    (problem: Problem) => {
      if (!problem.line) return;
      if (problem.file) {
        const base = problem.file.split("/").pop();
        const match = wsRef.current.files.find((f) => f.name === problem.file || f.name.split("/").pop() === base);
        if (match && match.id !== wsRef.current.activeFileId) updateWorkspace((s) => openFile(s, match.id));
      }
      setRevealPosition({ line: problem.line, column: problem.column, nonce: Date.now() });
    },
    [updateWorkspace]
  );

  const handleRenameProject = useCallback(
    async (rawName: string) => {
      const name = rawName.trim().slice(0, 80);
      if (!name || name === projectNameRef.current) return;
      const previous = projectNameRef.current;
      setProjectName(name);
      projectNameRef.current = name;
      const id = cloudProjectIdRef.current;
      if (!id) {
        toast.success("Project renamed");
        return;
      }
      try {
        const updated = await updateProject(id, { name });
        if (!updated) throw new Error("update failed");
        toast.success("Project renamed");
      } catch (err) {
        console.error("Rename project error:", err);
        if (projectNameRef.current === name) {
          setProjectName(previous);
          projectNameRef.current = previous;
        }
        toast.error("Could not rename the project. Check your connection and try again.");
      }
    },
    []
  );

  const handleActivityTabChange = (tab: SidebarTab) => {
    if (activeSidebarTab === tab && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveSidebarTab(tab);
      setSidebarOpen(true);
    }
  };

  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const toggleTerminal = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, []);
  const handleDownloadProject = useCallback(() => {
    const all = wsRef.current.files;
    if (all.length === 0) {
      toast.info("Nothing to download yet", { description: "Create a file first." });
      return;
    }
    const name = zipFileName(projectNameRef.current);
    downloadZip(name, buildZip(all.map((f) => ({ path: f.name, content: f.content }))));
    toast.success(`Downloaded ${name}`);
  }, []);

  const changeFontSize = useCallback((delta: number | null) => {
    const current = settingsRef.current.fontSize;
    updateEditorSettings({ fontSize: delta === null ? DEFAULT_EDITOR_SETTINGS.fontSize : current + delta });
  }, []);

  const paletteOpenRef = useRef(paletteOpen);
  paletteOpenRef.current = paletteOpen;

  // Stable wrappers handed to the editor and the key handlers so they never call stale handlers.
  const latest = useRef({ handleSave, handleDownload, handleRun, requestNewFile });
  latest.current = { handleSave, handleDownload, handleRun, requestNewFile };
  const editorRun = useCallback(() => void latest.current.handleRun(), []);
  const editorSave = useCallback(() => latest.current.handleSave(), []);

  // Shortcuts that must work everywhere, including inside the code editor (which would otherwise
  // take Ctrl/Cmd+K as the start of a chord). Capture phase runs before Monaco sees the key.
  useEffect(() => {
    const onKeyCapture = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      const inOverlay = isInsideOverlay(e.target);
      let action: (() => void) | null = null;
      if (key === "k" && !e.shiftKey) action = () => (paletteOpenRef.current ? setPaletteOpen(false) : openPalette("commands"));
      else if (key === "p" && e.shiftKey) action = () => openPalette("commands");
      else if (key === "p" && !e.shiftKey) action = () => openPalette("files");
      // Inside another dialog these keys belong to it (Ctrl+K and Ctrl+P still toggle the palette itself).
      if (action && inOverlay && !paletteOpenRef.current) return;
      if (!action && !inOverlay) {
        if (key === "," && !e.shiftKey) action = () => openSettings();
        else if (key === "b" && !e.shiftKey) action = toggleSidebar;
        else if (key === "j" && !e.shiftKey) action = toggleTerminal;
      }
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      action();
    };
    window.addEventListener("keydown", onKeyCapture, true);
    return () => window.removeEventListener("keydown", onKeyCapture, true);
  }, [openPalette, openSettings, toggleSidebar, toggleTerminal]);

  // The rest of the global shortcuts. The editor handles its own Ctrl/Cmd+S and +Enter, so these
  // run for focus elsewhere; they stay out of text fields and dialogs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const inOverlay = isInsideOverlay(e.target);
      // Save also works from text fields (it never edits them); dialogs keep their own keys.
      if (ctrl && !e.altKey && key === "s") {
        e.preventDefault(); // never open the browser's "Save page" dialog
        if (inOverlay) return;
        if (e.shiftKey) latest.current.handleDownload();
        else latest.current.handleSave();
        return;
      }
      // Text fields (the terminal prompt, rename and search boxes) use Enter themselves.
      if (inOverlay || isTypingOutsideEditor(e.target)) return;
      if (ctrl && key === "enter") {
        e.preventDefault();
        void latest.current.handleRun();
      } else if (ctrl && !e.altKey && key === "n") {
        // Browsers reserve Ctrl/Cmd+N; Alt+N below always works.
        e.preventDefault();
        if (e.shiftKey) setNewProjectOpen(true);
        else latest.current.requestNewFile();
      } else if (e.altKey && !ctrl && e.code === "KeyN") {
        e.preventDefault();
        if (e.shiftKey) setNewProjectOpen(true);
        else latest.current.requestNewFile();
      } else if (ctrl && e.key === "/") {
        e.preventDefault();
        openSettings("shortcuts");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSettings]);

  // Ask before leaving only when leaving would lose work: a cloud project with changes that are
  // not saved yet, a save still in flight, or a scratch workspace the browser refused to store.
  const leaveWouldLoseWork =
    settings.confirmBeforeLeave && (isSaving || (!!cloudProjectId && hasUnsavedChanges) || scratchUnsafe);
  useEffect(() => {
    if (!leaveWouldLoseWork) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need a return value to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [leaveWouldLoseWork]);

  // A short-lived zoom readout when the font size changes (not shown on first load).
  const [zoomNotice, setZoomNotice] = useState<number | null>(null);
  const lastFontSize = useRef(settings.fontSize);
  useEffect(() => {
    if (lastFontSize.current === settings.fontSize) return;
    lastFontSize.current = settings.fontSize;
    setZoomNotice(settings.fontSize);
    const t = setTimeout(() => setZoomNotice(null), 1200);
    return () => clearTimeout(t);
  }, [settings.fontSize]);

  // No file open means no editor markers to count.
  useEffect(() => {
    if (!activeFile) setEditorProblems(null);
  }, [activeFile]);

  // The status bar counts what the Problems tab lists (problems in the latest run output, read
  // with the same rule) plus the editor's own markers.
  const problemCounts = useMemo(
    () => combineProblemCounts(countProblems(problemsFromRunLines(terminalExternalLines)), editorProblems),
    [terminalExternalLines, editorProblems]
  );

  const showProblems = useCallback(() => {
    revealTerminal();
    setPanelRequest({ tab: "problems", nonce: Date.now() });
  }, [revealTerminal]);

  const hasFile = !!activeFile;
  const githubLinked = !!github.link;
  const githubSignedIn = !!github.auth;
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const needFile = hasFile ? undefined : "Open a file first";
    const cmds: PaletteCommand[] = [
      { id: "run", group: "Code", label: "Run", shortcut: shortcutFor("run"), keywords: ["execute", "start"], disabledReason: isRunning ? "Running" : needFile, run: () => void latest.current.handleRun() },
      ...(isRunning ? [{ id: "stop", group: "Code", label: "Stop", keywords: ["cancel", "abort", "kill"], run: handleStop }] : []),
      { id: "show-problems", group: "Code", label: "Show problems", keywords: ["errors", "warnings", "issues"], run: showProblems },
      { id: "clear-terminal", group: "Code", label: "Clear terminal", keywords: ["output", "console"], run: handleClearOutput },
      { id: "change-language", group: "Code", label: "Change language", keywords: ["mode", "syntax"], run: () => openPalette("languages") },
      { id: "save", group: "Files", label: "Save", shortcut: shortcutFor("save"), run: () => latest.current.handleSave() },
      { id: "new-file", group: "Files", label: "New file", shortcut: shortcutFor("new-file"), keywords: ["create"], run: () => latest.current.requestNewFile() },
      { id: "new-project", group: "Files", label: "New project", shortcut: shortcutFor("new-project"), keywords: ["create"], run: () => setNewProjectOpen(true) },
      { id: "goto-file", group: "Files", label: "Go to file", shortcut: shortcutFor("goto-file"), keywords: ["open", "find"], run: () => openPalette("files") },
      { id: "download-file", group: "Files", label: "Download file", shortcut: shortcutFor("download"), disabledReason: needFile, run: () => latest.current.handleDownload() },
      { id: "download-project", group: "Files", label: "Download project", keywords: ["zip", "export"], run: handleDownloadProject },
      { id: "share", group: "Files", label: "Share", keywords: ["link", "publish"], disabledReason: needFile, run: handleShare },
      { id: "toggle-sidebar", group: "View", label: "Toggle sidebar", shortcut: shortcutFor("toggle-sidebar"), keywords: ["explorer", "hide", "show"], run: toggleSidebar },
      { id: "toggle-terminal", group: "View", label: "Toggle terminal", shortcut: shortcutFor("toggle-terminal"), keywords: ["panel", "output", "console"], run: toggleTerminal },
      { id: "search", group: "View", label: "Search in files", keywords: ["find"], run: () => { setActiveSidebarTab("search"); setSidebarOpen(true); } },
      { id: "timeline", group: "View", label: "Show file history", keywords: ["timeline", "versions", "restore"], run: () => { setActiveSidebarTab("timeline"); setSidebarOpen(true); } },
      { id: "word-wrap", group: "View", label: settings.wordWrap ? "Turn off word wrap" : "Turn on word wrap", keywords: ["wrap", "lines"], run: () => updateEditorSettings({ wordWrap: !settingsRef.current.wordWrap }) },
      { id: "minimap", group: "View", label: settings.minimap ? "Hide minimap" : "Show minimap", run: () => updateEditorSettings({ minimap: !settingsRef.current.minimap }) },
      { id: "zoom-in", group: "View", label: "Make text bigger", keywords: ["zoom in", "font size"], run: () => changeFontSize(1) },
      { id: "zoom-out", group: "View", label: "Make text smaller", keywords: ["zoom out", "font size"], run: () => changeFontSize(-1) },
      { id: "zoom-reset", group: "View", label: "Reset text size", keywords: ["zoom", "font size"], run: () => changeFontSize(null) },
      { id: "settings", group: "Settings", label: "Open settings", shortcut: shortcutFor("settings"), keywords: ["preferences", "options"], run: () => openSettings() },
      { id: "shortcuts", group: "Settings", label: "Keyboard shortcuts", shortcut: shortcutFor("shortcuts"), keywords: ["keys", "hotkeys"], run: () => openSettings("shortcuts") },
      { id: "github", group: "GitHub", label: githubLinked ? "GitHub repository" : "Connect GitHub", keywords: ["git", "repo", "push", "pull"], run: () => github.setDialogOpen(true) },
      { id: "github-sync", group: "GitHub", label: "Sync now", keywords: ["git", "push", "pull"], disabledReason: githubLinked && githubSignedIn ? undefined : "Connect GitHub first", run: () => void github.syncNow() },
      { id: "dashboard", group: "Go to", label: "Go to dashboard", keywords: ["projects", "home"], run: () => navigate("/dashboard") },
    ];
    const order = ["Files", "Code", "View", "GitHub", "Settings", "Go to"];
    return cmds.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [
    hasFile,
    isRunning,
    githubLinked,
    githubSignedIn,
    github,
    settings.wordWrap,
    settings.minimap,
    handleStop,
    handleClearOutput,
    showProblems,
    handleDownloadProject,
    handleShare,
    openPalette,
    openSettings,
    toggleSidebar,
    toggleTerminal,
    changeFontSize,
    navigate,
  ]);
  const paletteFiles = useMemo(() => files.map((f) => ({ id: f.id, path: f.name })), [files]);

  const showHtmlPreview = activeFile?.languageId === "html" || activeFile?.languageId === "css";
  const projectKey = cloudProjectId ?? "scratch";

  const terminal = (
    <ErrorBoundary name="terminal" resetKeys={[projectKey]}>
      <TerminalPanel
        onClear={handleClearOutput}
        onCommand={handleTerminalCommand}
        isRunning={isRunning}
        fileContent={activeFile?.content ?? ""}
        fileLang={activeFile?.languageId ?? ""}
        hasActiveFile={!!activeFile}
        externalLines={terminalExternalLines}
        requestStdin={stdinRequestTrigger}
        onStop={handleStop}
        onRevealProblem={handleRevealProblem}
        requestTab={panelRequest}
      />
    </ErrorBoundary>
  );

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-ink">
      <TopBar
        activeLanguage={activeLanguage}
        activeFileName={activeFile?.name || ""}
        hasActiveFile={!!activeFile}
        projectName={projectName}
        onRun={editorRun}
        onStop={handleStop}
        onSave={handleSave}
        onDownload={handleDownload}
        onShare={handleShare}
        onNewFile={requestNewFile}
        onNewProject={() => setNewProjectOpen(true)}
        onLanguageChange={handleLanguageChange}
        onRenameProject={(name) => void handleRenameProject(name)}
        isRunning={isRunning}
        user={user}
        profile={profile}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        isCloudProject={!!cloudProjectId}
        onToggleShortcuts={() => openSettings("shortcuts")}
      />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar
          activeTab={activeSidebarTab}
          sidebarOpen={sidebarOpen}
          onTabChange={handleActivityTabChange}
          onOpenSettings={() => openSettings()}
          onOpenGitHub={() => github.setDialogOpen(true)}
          user={user}
          profile={profile}
        />

        {sidebarOpen && (
          <ErrorBoundary name="sidebar" resetKeys={[projectKey]}>
            <Sidebar
              files={files}
              activeFileId={activeFileId}
              projectName={projectName}
              isCloudProject={!!cloudProjectId}
              hasUnsavedChanges={hasUnsavedChanges}
              activeTab={activeSidebarTab}
              folders={folders}
              defaultLanguageId={defaultLanguageId}
              onSelectFile={handleSelectFileFromSidebar}
              onCreateFile={handleNewFile}
              onDeleteFile={handleDeleteFile}
              onRenameFile={handleRenameFile}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onRenameFolder={handleRenameFolder}
              onOpenSettings={() => openSettings()}
              onUploadFiles={handleUploadFiles}
              onRestoreSnapshot={handleRestoreSnapshot}
              inlineCreateTrigger={inlineCreateTrigger}
            />
          </ErrorBoundary>
        )}

        <PanelGroup direction="vertical" className="min-w-0 flex-1">
          <Panel defaultSize={65} minSize={30}>
            <ErrorBoundary name="editor" resetKeys={[projectKey, activeFileId]}>
              {!activeFile ? (
                <EditorEmptyState
                  variant={files.length === 0 ? "no-files" : "no-open-file"}
                  onNewFile={requestNewFile}
                  onNewProject={() => setNewProjectOpen(true)}
                  onCreateWithLanguage={handleCreateWithLanguage}
                  onUploadFiles={handleUploadFiles}
                />
              ) : (
                <div className="flex h-full flex-col">
                  <FileTabs
                    files={tabFiles}
                    activeFileId={activeFileId}
                    onSelectFile={handleSelectFile}
                    onCloseFile={handleCloseTab}
                  />
                  <Breadcrumbs
                    activeFilePath={activeFile.name}
                    projectName={projectName || "zuup-project"}
                    isRunning={isRunning}
                    onNavigateFolder={() => {
                      setActiveSidebarTab("explorer");
                      setSidebarOpen(true);
                    }}
                  />
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor
                      language={activeLanguage.monacoId}
                      value={activeFile.content}
                      onChange={updateFileContent}
                      onCursorChange={setCursorPosition}
                      filePath={activeFile.id}
                      onRun={editorRun}
                      onSave={editorSave}
                      liveFileIds={liveFileIds}
                      onMarkersChange={setEditorProblems}
                      revealPosition={revealPosition}
                    />
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </Panel>

          <PanelResizeHandle className="h-px bg-rule transition-colors duration-150 hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary/60 focus-visible:bg-primary/60 focus-visible:outline-none" />

          <Panel ref={terminalPanelRef} defaultSize={35} minSize={15} collapsible collapsedSize={0}>
            {/* One layout for both cases so the terminal never remounts (and never loses its output
                or re-reads an old stdin request) when switching between an HTML file and another. */}
            <PanelGroup direction="horizontal">
              <Panel id="terminal" order={1} defaultSize={50} minSize={20}>
                {terminal}
              </Panel>
              {showHtmlPreview && (
                <>
                  <PanelResizeHandle className="w-px bg-rule transition-colors duration-150 hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary/60 focus-visible:bg-primary/60 focus-visible:outline-none" />
                  <Panel id="preview" order={2} defaultSize={50} minSize={20}>
                    <ErrorBoundary name="preview" resetKeys={[projectKey, activeFileId]}>
                      <HtmlPreview code={activeFile?.content ?? ""} />
                    </ErrorBoundary>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar
        cursorPosition={cursorPosition}
        tabSize={settings.tabSize}
        insertSpaces={settings.insertSpaces}
        languageLabel={activeLanguage.label}
        isCloudProject={!!cloudProjectId}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        isRunning={isRunning}
        problems={problemCounts}
        onProblemsClick={showProblems}
        onLanguageClick={() => openPalette("languages")}
        githubStatus={<SyncStatusIndicator sync={github} />}
      />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialSection={settingsSection} />

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        onOpenChange={setPaletteOpen}
        onModeChange={setPaletteMode}
        commands={paletteCommands}
        files={paletteFiles}
        activeFileId={activeFileId}
        onOpenFile={handleSelectFile}
        languages={PALETTE_LANGUAGES}
        currentLanguageId={defaultLanguageId}
        onPickLanguage={handleLanguageChange}
      />

      <GitHubDialog sync={github} projectName={projectName} fileCount={files.length} />
      <ConflictDialog sync={github} />

      <NewProjectModal
        isOpen={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreateProject={handleNewProject}
        defaultLanguage={defaultLanguageId}
      />

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        fileName={activeFile?.name || ""}
        code={activeFile?.content || ""}
        language={activeFile?.languageId || "plaintext"}
        projectName={projectName}
        allFiles={files.map((f) => ({
          fileName: f.name,
          code: f.content,
          language: f.languageId,
        }))}
      />

      {zoomNotice !== null && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-9 right-4 z-40 rounded-md border border-rule bg-raised px-2.5 py-1 text-[12px] text-muted-foreground shadow-float"
        >
          Text size {zoomNotice}px
        </div>
      )}
    </div>
  );
};

export default Index;
