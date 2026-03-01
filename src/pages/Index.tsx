import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import CodeEditor from "@/components/ide/CodeEditor";
import Sidebar from "@/components/ide/Sidebar";
import TopBar from "@/components/ide/TopBar";
import TerminalPanel from "@/components/ide/TerminalPanel";
import HtmlPreview from "@/components/ide/HtmlPreview";
import FileTabs from "@/components/ide/FileTabs";
import SettingsModal from "@/components/ide/SettingsModal";
import NewFileModal from "@/components/ide/NewFileModal";
import NewProjectModal from "@/components/ide/NewProjectModal";
import type { NewProjectData } from "@/components/ide/NewProjectModal";
import ShareModal from "@/components/ide/ShareModal";
import { getLanguageById, languages } from "@/lib/languages";
import { FileTab, createFile, downloadFile, copyToClipboard } from "@/lib/fileSystem";
import { executeCode } from "@/lib/pistonApi";
import { loadSharedCode, loadSharedProject, clearUrlParams } from "@/lib/sharing";
import { useAuth } from "@/contexts/AuthContext";
import { createProject, updateProject, getProject, type SavedProject } from "@/lib/projectStorage";
import { toast } from "sonner";
import { FilePlus, Plus } from "lucide-react";

// Keyboard shortcuts data
const SHORTCUTS = [
  { keys: "Ctrl+S", desc: "Save" },
  { keys: "Ctrl+Enter", desc: "Run code" },
  { keys: "Ctrl+N", desc: "New file" },
  { keys: "Ctrl+Shift+N", desc: "New project" },
  { keys: "Ctrl+Shift+S", desc: "Download file" },
  { keys: "Ctrl+/", desc: "Show shortcuts" },
  { keys: "Ctrl+Wheel", desc: "Zoom in/out" },
];

const Index = () => {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // File management
  const [files, setFiles] = useState<FileTab[]>([]);
  const [activeFileId, setActiveFileId] = useState("");

  // Cloud project state
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs to avoid stale closures in auto-save timer
  const filesRef = useRef(files);
  const cloudProjectIdRef = useRef(cloudProjectId);
  const projectNameRef = useRef(projectName);
  const isSavingRef = useRef(isSaving);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { cloudProjectIdRef.current = cloudProjectId; }, [cloudProjectId]);
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);
  useEffect(() => { isSavingRef.current = isSaving; }, [isSaving]);

  // Load cloud project if ?project=<id> is in URL
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (projectId && user) {
      getProject(projectId).then((project) => {
        if (project && project.files.length > 0) {
          const loadedFiles = project.files.map((f) =>
            createFile(f.name, f.language, f.content)
          );
          setFiles(loadedFiles);
          setActiveFileId(loadedFiles[0].id);
          setCloudProjectId(project.id);
          setProjectName(project.name);
          toast.success(`Opened "${project.name}"`);
        }
      });
    }
  }, [searchParams, user]);

  // Open New Project modal when navigated from Dashboard with ?new=true
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
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<"output" | "terminal">("output");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Settings
  const [fontSize, setFontSize] = useState(14);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(false);

  // Check for shared code or project in URL on component mount
  useEffect(() => {
    const sharedCode = loadSharedCode();
    if (sharedCode) {
      const sharedFile = createFile(
        sharedCode.fileName,
        sharedCode.language,
        sharedCode.code
      );
      setFiles([sharedFile]);
      setActiveFileId(sharedFile.id);
      clearUrlParams();
      toast.success(`Loaded shared code: ${sharedCode.fileName}`);
      return;
    }

    const sharedProject = loadSharedProject();
    if (sharedProject) {
      const projectFiles = sharedProject.files.map(file => 
        createFile(file.fileName, file.language, file.code)
      );
      setFiles(projectFiles);
      const mainFile = projectFiles.find(f => f.name === sharedProject.mainFileName) || projectFiles[0];
      setActiveFileId(mainFile.id);
      clearUrlParams();
      toast.success(`Loaded shared project: ${sharedProject.name}`, {
        description: `${projectFiles.length} files loaded`
      });
      return;
    }
  }, []);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || null;
  const activeLanguage = getLanguageById(activeFile?.languageId || "python");

  const updateFileContent = useCallback((content: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content, isDirty: true } : f))
    );
    setHasUnsavedChanges(true);

    // Auto-save to cloud after 3 seconds of inactivity
    if (cloudProjectId && user) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        performCloudSave();
      }, 3000);
    }
  }, [activeFileId, cloudProjectId, user]);

  const handleLanguageChange = useCallback((langId: string) => {
    const lang = getLanguageById(langId);
    setFiles((prev) =>
      prev.map((f) =>
        f.id === activeFileId
          ? { ...f, languageId: langId, name: f.name.replace(/\.[^.]+$/, lang.extension) }
          : f
      )
    );
  }, [activeFileId]);

  const handleNewFile = useCallback((name: string, languageId: string) => {
    const file = createFile(name, languageId, "");
    setFiles((prev) => [...prev, file]);
    setActiveFileId(file.id);
  }, []);

  const handleNewProject = useCallback(async (data: NewProjectData) => {
    let projectFiles: FileTab[] = [];

    if (data.template) {
      // From template
      projectFiles = data.template.files.map(file => {
        const fileName = file.path === "/" ? file.fileName : `${file.path.replace(/\/$/, "")}/${file.fileName}`;
        return createFile(fileName, file.language, file.content);
      });
    } else if (data.uploadedFiles.length > 0) {
      // From uploaded files
      projectFiles = data.uploadedFiles.map(file => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const lang = languages.find(l => l.extension === `.${ext}`)?.id || data.language;
        return createFile(file.name, lang, file.content);
      });
    }

    const mainFile = data.template
      ? projectFiles.find(f => f.name.includes(data.template!.mainFile)) || projectFiles[0]
      : projectFiles[0];

    setFiles(projectFiles);
    setActiveFileId(mainFile?.id || "");
    setProjectName(data.name);

    // Save to cloud immediately if signed in
    if (user) {
      const fileData = projectFiles.map(f => ({
        name: f.name,
        language: f.languageId,
        content: f.content,
      }));
      const saved = await createProject(data.name, data.description, data.language, fileData);
      if (saved) {
        setCloudProjectId(saved.id);
        toast.success(`Created "${data.name}" — saved to cloud ☁️`);
      } else {
        toast.success(`Created "${data.name}"`, { description: "Could not save to cloud" });
      }
    } else {
      toast.success(`Created "${data.name}"`, {
        description: "Sign in to save to cloud",
      });
    }
    setHasUnsavedChanges(false);
  }, [user]);

  const handleCloseFile = useCallback((id: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length === 0) {
        setActiveFileId("");
        return [];
      }
      if (activeFileId === id) {
        setActiveFileId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeFileId]);

  const handleSave = useCallback(() => {
    if (!activeFile) return;
    setFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, isDirty: false } : f)));
    // Smart save: cloud if signed in, otherwise just local
    if (user) {
      performCloudSave();
    } else {
      setHasUnsavedChanges(false);
      toast.success(`Saved ${activeFile.name}`);
    }
  }, [activeFileId, activeFile?.name, user]);

  const performCloudSave = useCallback(async () => {
    if (!user || isSavingRef.current) return;
    setIsSaving(true);
    // Read latest state from refs to avoid stale closure
    const currentFiles = filesRef.current;
    const currentCloudId = cloudProjectIdRef.current;
    const currentProjectName = projectNameRef.current;
    const projectFiles = currentFiles.map((f) => ({
      name: f.name,
      language: f.languageId,
      content: f.content,
    }));
    const primaryLang = currentFiles[0]?.languageId || "python";
    try {
      if (currentCloudId) {
        const updated = await updateProject(currentCloudId, {
          files: projectFiles,
          language: primaryLang,
        });
        if (updated) {
          setHasUnsavedChanges(false);
          setFiles(prev => prev.map(f => ({ ...f, isDirty: false })));
        } else {
          toast.error("Failed to save — check console");
        }
      } else {
        const name = currentProjectName || currentFiles[0]?.name || "Untitled";
        const created = await createProject(name, "", primaryLang, projectFiles);
        if (created) {
          setCloudProjectId(created.id);
          setProjectName(created.name);
          setHasUnsavedChanges(false);
          setFiles(prev => prev.map(f => ({ ...f, isDirty: false })));
          toast.success("Project saved to cloud ☁️");
        }
      }
    } catch (err) {
      console.error("Cloud save error:", err);
      toast.error("Error saving to cloud");
    }
    setIsSaving(false);
  }, [user]);

  // Upload files into current project
  const handleUploadFiles = useCallback((uploadedFiles: { name: string; content: string }[]) => {
    const newFiles = uploadedFiles.map(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const lang = languages.find(l => l.extension === `.${ext}`)?.id || activeFile.languageId;
      return createFile(f.name, lang, f.content);
    });
    setFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length > 0) setActiveFileId(newFiles[0].id);
    setHasUnsavedChanges(true);
    toast.success(`Added ${newFiles.length} file${newFiles.length > 1 ? "s" : ""}`);
  }, [activeFile.languageId]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    downloadFile(activeFile.name, activeFile.content);
    toast.success(`Downloaded ${activeFile.name}`);
  }, [activeFile]);

  const handleShare = useCallback(() => {
    setShareModalOpen(true);
  }, []);

  const handleRun = useCallback(async () => {
    if (!activeFile) return;
    setIsRunning(true);
    setBottomTab("output");
    setOutput([`>>> Running ${activeLanguage.label}...`, ""]);

    if (activeFile.languageId === "html" || activeFile.languageId === "css") {
      setOutput((prev) => [...prev, "[OK] Rendered in preview panel."]);
      setIsRunning(false);
      return;
    }

    if (activeLanguage.pistonLang) {
      const result = await executeCode(activeLanguage.pistonLang, activeLanguage.pistonVersion, activeFile.content);
      setOutput((prev) => [
        ...prev,
        ...result.output,
        "",
        result.success ? "[OK] Execution completed." : "[ERROR] Execution failed.",
      ]);
    } else {
      setOutput((prev) => [...prev, "[WARN] No runtime available for this language.", ""]);
    }

    setIsRunning(false);
  }, [activeLanguage, activeFile]);

  const handleClearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  const handleTerminalCommand = useCallback((cmd: string) => {
    // Commands from terminal can trigger run
    if (cmd === "run") {
      handleRun();
    }
  }, [handleRun]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (ctrl && e.key === "s" && e.shiftKey) {
        e.preventDefault();
        handleDownload();
      } else if (ctrl && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      } else if (ctrl && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        setNewFileOpen(true);
      } else if (ctrl && e.key === "N" && e.shiftKey) {
        e.preventDefault();
        setNewProjectOpen(true);
      } else if (ctrl && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleDownload, handleRun]);

  const showHtmlPreview = activeFile?.languageId === "html" || activeFile?.languageId === "css";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TopBar
        activeLanguage={activeLanguage}
        activeFileName={activeFile?.name || ""}
        projectName={projectName}
        onRun={handleRun}
        onSave={handleSave}
        onDownload={handleDownload}
        onShare={handleShare}
        onNewFile={() => setNewFileOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
        onLanguageChange={handleLanguageChange}
        isRunning={isRunning}
        user={user}
        profile={profile}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        isCloudProject={!!cloudProjectId}
        onToggleShortcuts={() => setShortcutsOpen(prev => !prev)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          files={files}
          activeFileId={activeFileId}
          projectName={projectName}
          isCloudProject={!!cloudProjectId}
          hasUnsavedChanges={hasUnsavedChanges}
          onSelectFile={setActiveFileId}
          onNewFile={() => setNewFileOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onUploadFiles={handleUploadFiles}
        />

        <PanelGroup direction="vertical" className="flex-1">
          <Panel defaultSize={65} minSize={30}>
            {files.length === 0 ? (
              <div className="flex h-full items-center justify-center bg-background">
                <div className="text-center space-y-5 max-w-xs">
                  <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <FilePlus size={32} className="text-primary/80" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground">No files yet</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Create your first file to start coding
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => setNewFileOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110 transition-all"
                    >
                      <Plus size={16} />
                      Create New File
                    </button>
                    <p className="text-[10px] text-muted-foreground/50">
                      or press{" "}
                      <kbd className="rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] font-mono border border-border/50">Ctrl+N</kbd>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <FileTabs
                  files={files}
                  activeFileId={activeFileId}
                  onSelectFile={setActiveFileId}
                  onCloseFile={handleCloseFile}
                />
                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    language={activeLanguage.monacoId}
                    value={activeFile?.content || ""}
                    onChange={updateFileContent}
                    fontSize={fontSize}
                    onFontSizeChange={setFontSize}
                  />
                </div>
              </div>
            )}
          </Panel>

          <PanelResizeHandle className="h-1.5 bg-border/50 hover:bg-primary/30 transition-colors cursor-row-resize flex items-center justify-center">
            <div className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
          </PanelResizeHandle>

          <Panel defaultSize={35} minSize={15}>
            {showHtmlPreview ? (
              <PanelGroup direction="horizontal">
                <Panel defaultSize={50} minSize={20}>
                  <TerminalPanel
                    output={output}
                    onClear={handleClearOutput}
                    onCommand={handleTerminalCommand}
                    isRunning={isRunning}
                    activeTab={bottomTab}
                    onTabChange={setBottomTab}
                  />
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-border/50 hover:bg-primary/30 transition-colors cursor-col-resize flex items-center justify-center">
                  <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30" />
                </PanelResizeHandle>
                <Panel defaultSize={50} minSize={20}>
                  <HtmlPreview code={activeFile.content} />
                </Panel>
              </PanelGroup>
            ) : (
              <TerminalPanel
                output={output}
                onClear={handleClearOutput}
                onCommand={handleTerminalCommand}
                isRunning={isRunning}
                activeTab={bottomTab}
                onTabChange={setBottomTab}
              />
            )}
          </Panel>
        </PanelGroup>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        tabSize={tabSize}
        onTabSizeChange={setTabSize}
        wordWrap={wordWrap}
        onWordWrapChange={setWordWrap}
      />

      <NewFileModal
        isOpen={newFileOpen}
        onClose={() => setNewFileOpen(false)}
        onCreateFile={handleNewFile}
      />

      <NewProjectModal
        isOpen={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreateProject={handleNewProject}
      />

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        fileName={activeFile?.name || ""}
        code={activeFile?.content || ""}
        language={activeFile?.languageId || "python"}
        projectName={projectName}
        allFiles={files.map(f => ({
          fileName: f.name,
          code: f.content,
          language: f.languageId
        }))}
      />

      {/* Keyboard Shortcuts Overlay */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl glass-strong glow-primary shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
              <button onClick={() => setShortcutsOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors text-xs">
                ESC
              </button>
            </div>
            <div className="p-4 space-y-2">
              {SHORTCUTS.map(s => (
                <div key={s.keys} className="flex items-center justify-between py-1.5">
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
      {fontSize !== 14 && (
        <div className="fixed bottom-4 right-4 z-40 rounded-lg bg-secondary/90 border border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
          Zoom: {Math.round((fontSize / 14) * 100)}%
        </div>
      )}
    </div>
  );
};

export default Index;
