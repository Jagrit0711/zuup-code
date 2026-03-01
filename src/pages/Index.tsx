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
import { loadSharedCode, loadSharedProject, clearUrlParams, getShareIdFromUrl } from "@/lib/sharing";
import { useAuth } from "@/contexts/AuthContext";
import { createProject, updateProject, getProject, type SavedProject } from "@/lib/projectStorage";
import { toast } from "sonner";

const Index = () => {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();

  // File management
  const defaultFile = createFile("main.py", "python", getLanguageById("python").defaultCode);
  const [files, setFiles] = useState<FileTab[]>([defaultFile]);
  const [activeFileId, setActiveFileId] = useState(defaultFile.id);

  // Cloud project state
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Load shared code on page load
  useEffect(() => {
    const shareId = getShareIdFromUrl();
    if (shareId) {
      const sharedCode = loadSharedCode(shareId);
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
      } else {
        toast.error("Shared code not found or expired");
        clearUrlParams();
      }
    }
  }, []);

  // UI state
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<"output" | "terminal">("output");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

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

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];
  const activeLanguage = getLanguageById(activeFile.languageId);

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
    const lang = getLanguageById(languageId);
    const file = createFile(name, languageId, lang.defaultCode);
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
    } else {
      // Blank project
      const lang = getLanguageById(data.language);
      projectFiles = [createFile(`main${lang.extension}`, data.language, lang.defaultCode)];
    }

    const mainFile = data.template
      ? projectFiles.find(f => f.name.includes(data.template!.mainFile)) || projectFiles[0]
      : projectFiles[0];

    setFiles(projectFiles);
    setActiveFileId(mainFile.id);
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
        const def = createFile("main.py", "python", getLanguageById("python").defaultCode);
        setActiveFileId(def.id);
        return [def];
      }
      if (activeFileId === id) {
        setActiveFileId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeFileId]);

  const handleSave = useCallback(() => {
    setFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, isDirty: false } : f)));
    // If signed in + cloud project, also cloud save
    if (user && cloudProjectId) {
      performCloudSave();
    } else {
      toast.success(`Saved ${activeFile.name}`);
    }
  }, [activeFileId, activeFile.name, user, cloudProjectId]);

  const performCloudSave = useCallback(async () => {
    if (!user || isSaving) return;
    setIsSaving(true);
    const projectFiles = files.map((f) => ({
      name: f.name,
      language: f.languageId,
      content: f.content,
    }));
    try {
      if (cloudProjectId) {
        const updated = await updateProject(cloudProjectId, {
          files: projectFiles,
          language: activeFile.languageId,
        });
        if (updated) {
          setHasUnsavedChanges(false);
          setFiles(prev => prev.map(f => ({ ...f, isDirty: false })));
        }
      } else {
        const name = projectName || activeFile.name;
        const created = await createProject(name, "", activeFile.languageId, projectFiles);
        if (created) {
          setCloudProjectId(created.id);
          setProjectName(created.name);
          setHasUnsavedChanges(false);
          setFiles(prev => prev.map(f => ({ ...f, isDirty: false })));
          toast.success("Project saved to cloud ☁️");
        }
      }
    } catch {
      toast.error("Error saving to cloud");
    }
    setIsSaving(false);
  }, [user, files, activeFile, cloudProjectId, projectName, isSaving]);

  const handleCloudSave = useCallback(async () => {
    if (!user) {
      toast.error("Sign in to save to cloud");
      return;
    }
    await performCloudSave();
    if (!isSaving) toast.success("Saved to cloud ☁️");
  }, [user, performCloudSave, isSaving]);

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
    downloadFile(activeFile.name, activeFile.content);
    toast.success(`Downloaded ${activeFile.name}`);
  }, [activeFile]);

  const handleShare = useCallback(() => {
    setShareModalOpen(true);
  }, []);

  const handleRun = useCallback(async () => {
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

  const showHtmlPreview = activeFile.languageId === "html" || activeFile.languageId === "css";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TopBar
        activeLanguage={activeLanguage}
        activeFileName={activeFile.name}
        projectName={projectName}
        onRun={handleRun}
        onSave={handleSave}
        onDownload={handleDownload}
        onShare={handleShare}
        onNewFile={() => setNewFileOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
        onLanguageChange={handleLanguageChange}
        onCloudSave={handleCloudSave}
        isRunning={isRunning}
        user={user}
        profile={profile}
        isSaving={isSaving}
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
                  value={activeFile.content}
                  onChange={updateFileContent}
                  fontSize={fontSize}
                />
              </div>
            </div>
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
        fileName={activeFile.name}
        code={activeFile.content}
        language={activeFile.languageId}
        allFiles={files.map(f => ({
          fileName: f.name,
          code: f.content,
          language: f.languageId
        }))}
      />
    </div>
  );
};

export default Index;
