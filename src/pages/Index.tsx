import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import CodeEditor from "@/components/ide/CodeEditor";
import Sidebar, { type SidebarTab } from "@/components/ide/Sidebar";
import ActivityBar from "@/components/ide/ActivityBar";
import StatusBar from "@/components/ide/StatusBar";
import TopBar from "@/components/ide/TopBar";
import TerminalPanel from "@/components/ide/TerminalPanel";
import HtmlPreview from "@/components/ide/HtmlPreview";
import FileTabs from "@/components/ide/FileTabs";
import Breadcrumbs from "@/components/ide/Breadcrumbs";
import EditorEmptyState from "@/components/ide/EditorEmptyState";
import SettingsModal from "@/components/ide/SettingsModal";
import NewProjectModal from "@/components/ide/NewProjectModal";
import type { NewProjectData } from "@/components/ide/NewProjectModal";
import ShareModal from "@/components/ide/ShareModal";
import GitHubDialog from "@/components/ide/github/GitHubDialog";
import ConflictDialog from "@/components/ide/github/ConflictDialog";
import SyncStatusIndicator from "@/components/ide/github/SyncStatusIndicator";
import { useGitHubSync, type GitHubSync } from "@/hooks/useGitHubSync";
import { type AppliedChange, type LocalFile, SCRATCH_PROJECT_KEY } from "@/lib/github";
import { applyRemoteChanges, toSyncFiles, workspaceFromSyncFiles } from "@/lib/githubWorkspace";
import { getLanguageById, detectLanguageFromFilename, detectNeedsStdin } from "@/lib/languages";
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
import { useEditorSettings } from "@/lib/editorSettings";
import { executeCode } from "@/lib/pistonApi";
import { loadSharedCode, loadSharedProject, clearUrlParams } from "@/lib/sharing";
import { recordSnapshot } from "@/lib/timelineStorage";
import { useAuth } from "@/contexts/AuthContext";
import { createProject, updateProject, getProject } from "@/lib/projectStorage";
import { toast } from "sonner";

// Keyboard shortcuts data
const SHORTCUTS = [
  { keys: "Ctrl+S", desc: "Save" },
  { keys: "Ctrl+Enter", desc: "Run code" },
  { keys: "Ctrl+N / Alt+N", desc: "New file" },
  { keys: "Ctrl+Shift+N / Alt+Shift+N", desc: "New project" },
  { keys: "Ctrl+Shift+S", desc: "Download file" },
  { keys: "F2 / Del", desc: "Rename / delete in Explorer" },
  { keys: "Ctrl+/", desc: "Show shortcuts" },
  { keys: "Ctrl+Wheel", desc: "Zoom in/out" },
];

type TerminalLine = {
  text: string;
  type: "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt";
};

const SCRATCH_AUTOSAVE_MS = 500;
const CLOUD_AUTOSAVE_MS = 3000;

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

function toResultLines(output: string[], success: boolean): TerminalLine[] {
  return [
    ...output.flatMap((line) =>
      line.split("\n").map((l) => ({
        text: l,
        type: (l.startsWith("❌") || l.toLowerCase().includes("error") || l.toLowerCase().includes("traceback")
          ? "error"
          : "output") as "output" | "error",
      }))
    ),
    { text: "", type: "output" as const },
    {
      text: success ? "✅ Execution completed." : "❌ Execution failed.",
      type: success ? ("success" as const) : ("error" as const),
    },
  ];
}

interface ForkPayload {
  name?: string;
  files?: { fileName: string; language?: string; code: string }[];
}

const Index = () => {
  const { user, profile, loading, signInWithZuup } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useEditorSettings();

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
  const performCloudSave = useCallback(async () => {
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
          toast.success("Saved to cloud");
        } else {
          toast.error("Failed to save. Your changes are still in the editor.");
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
          toast.success("Project saved to cloud");
        } else {
          toast.error("Could not create a cloud project.");
        }
      }
    } catch (err) {
      console.error("Cloud save error:", err);
      toast.error("Error saving to cloud");
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
      void performCloudSave();
    }
  }, [commitWorkspace, setCloudProject, syncProjectParam]);

  const scheduleCloudAutosave = useCallback(() => {
    if (!cloudProjectIdRef.current || !userRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void performCloudSave();
    }, CLOUD_AUTOSAVE_MS);
  }, [performCloudSave]);

  /** Call after any change to files/folders so "unsaved" state and cloud auto-save stay correct. */
  const markChanged = useCallback(() => {
    setHasUnsavedChanges(true);
    scheduleCloudAutosave();
  }, [scheduleCloudAutosave]);

  useEffect(
    () => () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
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
  const [isRunning, setIsRunning] = useState(false);
  // Lines pushed into the terminal after execution
  const [terminalExternalLines, setTerminalExternalLines] = useState<TerminalLine[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // VS Code Layout State
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
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

  /** Runs the active file and streams the result into the terminal. */
  const executeActiveFile = useCallback(
    async (stdin?: string) => {
      if (!activeFile) return;
      const lang = getLanguageById(activeFile.languageId);

      setIsRunning(true);
      const initialLines: TerminalLine[] = [{ text: `▶ Running ${activeFile.name} (${lang.label})…`, type: "info" }];
      if (stdin && stdin.trim()) {
        initialLines.push({ text: `📥 Input: ${stdin.trim().replace(/\n/g, " ")}`, type: "stdin-prompt" });
      }
      setTerminalExternalLines(initialLines);

      // Record snapshot on execution
      recordSnapshot(activeFile.id, activeFile.name, activeFile.content, "Code Run");

      try {
        if (!lang.pistonLang) {
          setTerminalExternalLines([
            { text: `[WARN] ${lang.label} can't be run here. It is available for editing and syntax highlighting only.`, type: "info" },
          ]);
          return;
        }
        const stdinToPass = stdin && stdin.trim() ? stdin : undefined;
        const result = await executeCode(lang.pistonLang, lang.pistonVersion, activeFile.content, stdinToPass);
        const resultLines = toResultLines(result.output, result.success);

        // If program failed due to EOF / missing input, prompt in terminal to re-run:
        if (!stdinToPass && result.output.some((l) => l.includes("EOFError") || l.includes("EOF") || l.includes("NoSuchElementException"))) {
          resultLines.push({
            text: "💡 Program halted waiting for input. Type input below and press Enter to re-run:",
            type: "stdin-prompt",
          });
          setStdinRequestTrigger(Date.now());
        }
        setTerminalExternalLines(resultLines);

        if (result.success) {
          addCreatedFiles(detectCreatedFiles(activeFile.content, activeFile.languageId, result.output));
        }
      } catch (err) {
        console.error("Execution error:", err);
        const message = err instanceof Error ? err.message : "";
        setTerminalExternalLines([
          { text: `❌ Execution error: ${message || "Failed to contact execution server"}`, type: "error" },
          { text: "Check your internet connection or try again.", type: "info" },
        ]);
      } finally {
        setIsRunning(false);
      }
    },
    [activeFile, addCreatedFiles]
  );

  const handleRun = useCallback(
    async (customStdin?: unknown) => {
      if (!activeFile) {
        toast.info("Create or open a file to run it.");
        return;
      }
      if (isRunning) return;

      if (activeFile.languageId === "html" || activeFile.languageId === "css") {
        setTerminalExternalLines([{ text: "[OK] Rendered in preview panel.", type: "success" }]);
        return;
      }

      // Safely check if customStdin is an actual string (prevents React MouseEvent crash!)
      const stdinArg: string | undefined = typeof customStdin === "string" ? customStdin : undefined;
      const lang = getLanguageById(activeFile.languageId);
      const needsStdin = detectNeedsStdin(activeFile.content, activeFile.languageId);

      // If program expects input and none was provided yet, prompt directly in the terminal!
      if (needsStdin && stdinArg === undefined && !programStdin.trim()) {
        setTerminalExternalLines([
          { text: `▶ Running ${activeFile.name} (${lang.label})…`, type: "info" },
          { text: "⌨ Program waiting for input (scanf / input()).", type: "info" },
          { text: "Type your input below and press Enter to execute (or Shift+Enter for multiline):", type: "stdin-prompt" },
        ]);
        setStdinRequestTrigger(Date.now());
        return;
      }

      await executeActiveFile(stdinArg !== undefined ? stdinArg : programStdin);
    },
    [activeFile, isRunning, programStdin, executeActiveFile]
  );

  const handleClearOutput = useCallback(() => {
    setTerminalExternalLines([{ text: "Terminal cleared.", type: "info" }]);
  }, []);

  const handleTerminalCommand = useCallback(
    async (cmd: string) => {
      if (!activeFile) {
        setTerminalExternalLines([{ text: "❌ No file is open. Create or open a file first.", type: "error" }]);
        return;
      }

      // Plain "run" — run the active file, output stays in Terminal tab
      if (cmd === "run") {
        // HTML/CSS: just show a note
        if (activeFile.languageId === "html" || activeFile.languageId === "css") {
          setTerminalExternalLines([{ text: "[OK] Rendered in preview panel.", type: "success" }]);
          return;
        }
        await executeActiveFile();
        return;
      }

      // "run-with-stdin:<b64stdin>" — execute active file with captured stdin
      if (cmd.startsWith("run-with-stdin:")) {
        if (!getLanguageById(activeFile.languageId).pistonLang) {
          setTerminalExternalLines([{ text: "❌ This language has no runtime here.", type: "error" }]);
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
    [activeFile, executeActiveFile]
  );

  const handleActivityTabChange = (tab: SidebarTab) => {
    if (activeSidebarTab === tab && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveSidebarTab(tab);
      setSidebarOpen(true);
    }
  };

  // Stable wrappers handed to the editor so its keybindings never call stale handlers.
  const latest = useRef({ handleSave, handleDownload, handleRun, requestNewFile });
  latest.current = { handleSave, handleDownload, handleRun, requestNewFile };
  const editorRun = useCallback(() => void latest.current.handleRun(), []);
  const editorSave = useCallback(() => latest.current.handleSave(), []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && !e.altKey && key === "s") {
        e.preventDefault();
        if (e.shiftKey) latest.current.handleDownload();
        else latest.current.handleSave();
      } else if (ctrl && key === "enter") {
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
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShortcutsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen]);

  const showHtmlPreview = activeFile?.languageId === "html" || activeFile?.languageId === "css";

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#07090e]">
      {/* ─── Liquid Glass Background Lighting Mesh (Real optical refraction behind panels) ─── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 h-[550px] w-[550px] rounded-full bg-primary/10 blur-[150px] animate-liquid-1" />
        <div className="absolute top-1/4 -right-32 h-[650px] w-[650px] rounded-full bg-sky-500/10 blur-[170px] animate-liquid-2" />
        <div className="absolute -bottom-32 left-1/4 h-[550px] w-[550px] rounded-full bg-violet-600/10 blur-[160px] animate-liquid-1" />
      </div>

      <TopBar
        activeLanguage={activeLanguage}
        activeFileName={activeFile?.name || ""}
        hasActiveFile={!!activeFile}
        projectName={projectName}
        onRun={() => void handleRun()}
        onSave={handleSave}
        onDownload={handleDownload}
        onShare={handleShare}
        onNewFile={requestNewFile}
        onNewProject={() => setNewProjectOpen(true)}
        onLanguageChange={handleLanguageChange}
        isRunning={isRunning}
        user={user}
        profile={profile}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        isCloudProject={!!cloudProjectId}
        onToggleShortcuts={() => setShortcutsOpen((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden z-10">
        {/* VS Code Left Activity Bar */}
        <ActivityBar
          activeTab={activeSidebarTab}
          sidebarOpen={sidebarOpen}
          onTabChange={handleActivityTabChange}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenGitHub={() => github.setDialogOpen(true)}
          user={user}
          profile={profile}
        />

        {/* VS Code Sidebar (Explorer with Full Folder Tree / Search / Timeline) */}
        {sidebarOpen && (
          <Sidebar
            files={files}
            activeFileId={activeFileId}
            projectName={projectName}
            isCloudProject={!!cloudProjectId}
            hasUnsavedChanges={hasUnsavedChanges}
            activeTab={activeSidebarTab}
            folders={folders}
            defaultLanguageId={defaultLanguageId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleNewFile}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            onOpenSettings={() => setSettingsOpen(true)}
            onUploadFiles={handleUploadFiles}
            onRestoreSnapshot={handleRestoreSnapshot}
            inlineCreateTrigger={inlineCreateTrigger}
          />
        )}

        <PanelGroup direction="vertical" className="flex-1">
          <Panel defaultSize={65} minSize={30}>
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
                  />
                </div>
              </div>
            )}
          </Panel>

          <PanelResizeHandle className="h-1.5 bg-white/[0.04] hover:bg-primary/30 transition-colors cursor-row-resize flex items-center justify-center border-y border-white/[0.05]">
            <div className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
          </PanelResizeHandle>

          <Panel defaultSize={35} minSize={15}>
            {showHtmlPreview ? (
              <PanelGroup direction="horizontal">
                <Panel defaultSize={50} minSize={20}>
                  <TerminalPanel
                    onClear={handleClearOutput}
                    onCommand={handleTerminalCommand}
                    isRunning={isRunning}
                    fileContent={activeFile?.content ?? ""}
                    fileLang={activeFile?.languageId ?? ""}
                    hasActiveFile={!!activeFile}
                    externalLines={terminalExternalLines}
                    requestStdin={stdinRequestTrigger}
                  />
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-border/50 hover:bg-primary/30 transition-colors cursor-col-resize flex items-center justify-center">
                  <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30" />
                </PanelResizeHandle>
                <Panel defaultSize={50} minSize={20}>
                  <HtmlPreview code={activeFile?.content ?? ""} />
                </Panel>
              </PanelGroup>
            ) : (
              <TerminalPanel
                onClear={handleClearOutput}
                onCommand={handleTerminalCommand}
                isRunning={isRunning}
                fileContent={activeFile?.content ?? ""}
                fileLang={activeFile?.languageId ?? ""}
                hasActiveFile={!!activeFile}
                externalLines={terminalExternalLines}
                requestStdin={stdinRequestTrigger}
              />
            )}
          </Panel>
        </PanelGroup>
      </div>

      {/* VS Code Bottom Status Bar */}
      <StatusBar
        cursorPosition={cursorPosition}
        tabSize={settings.tabSize}
        languageLabel={activeLanguage.label}
        isCloudProject={!!cloudProjectId}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onLanguageClick={() => setSettingsOpen(true)}
        githubStatus={<SyncStatusIndicator sync={github} />}
      />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

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

      {/* Keyboard Shortcuts Overlay */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className="relative z-10 w-full max-w-sm rounded-xl glass-strong glow-primary shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
              >
                ESC
              </button>
            </div>
            <div className="p-4 space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-xs text-muted-foreground">{s.desc}</span>
                  <kbd className="rounded bg-secondary/80 px-2 py-0.5 text-[11px] font-mono text-foreground border border-border/50">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
            <div className="border-t border-border px-5 py-2.5">
              <p className="text-[10px] text-muted-foreground/60 text-center">
                Press Ctrl+/ to toggle this panel
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Zoom indicator */}
      {settings.fontSize !== 14 && (
        <div className="fixed bottom-8 right-4 z-40 rounded-lg bg-secondary/90 border border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
          Zoom: {Math.round((settings.fontSize / 14) * 100)}%
        </div>
      )}
    </div>
  );
};

export default Index;
