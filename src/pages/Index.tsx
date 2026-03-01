import { useState, useCallback, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import CodeEditor from "@/components/ide/CodeEditor";
import Sidebar from "@/components/ide/Sidebar";
import TopBar from "@/components/ide/TopBar";
import TerminalPanel from "@/components/ide/TerminalPanel";
import HtmlPreview from "@/components/ide/HtmlPreview";
import FileTabs from "@/components/ide/FileTabs";
import SettingsModal from "@/components/ide/SettingsModal";
import NewFileModal from "@/components/ide/NewFileModal";
import ShareModal from "@/components/ide/ShareModal";
import { getLanguageById } from "@/lib/languages";
import { FileTab, createFile, downloadFile, copyToClipboard } from "@/lib/fileSystem";
import { executeCode } from "@/lib/pistonApi";
import { loadSharedCode, loadSharedProject, clearUrlParams } from "@/lib/sharing";
import { toast } from "sonner";

const Index = () => {
  // File management
  const defaultFile = createFile("main.py", "python", getLanguageById("python").defaultCode);
  const [files, setFiles] = useState<FileTab[]>([defaultFile]);
  const [activeFileId, setActiveFileId] = useState(defaultFile.id);

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
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Settings
  const [fontSize, setFontSize] = useState(14);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(false);

  // Check for shared code or project in URL on component mount
  useEffect(() => {
    console.log('Debug: useEffect triggered, checking for shared content...');
    
    // Check for single file share (URL-encoded)
    const sharedCode = loadSharedCode();
    console.log('Debug: Loaded shared code:', sharedCode);
    
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

    // Check for project share (URL-encoded)
    const sharedProject = loadSharedProject();
    console.log('Debug: Loaded shared project:', sharedProject);
    
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
  }, []);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];
  const activeLanguage = getLanguageById(activeFile.languageId);

  const updateFileContent = useCallback((content: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content, isDirty: true } : f))
    );
  }, [activeFileId]);

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
    toast.success(`Saved ${activeFile.name}`);
  }, [activeFileId, activeFile.name]);

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
        onRun={handleRun}
        onSave={handleSave}
        onDownload={handleDownload}
        onShare={handleShare}
        onNewFile={() => setNewFileOpen(true)}
        onLanguageChange={handleLanguageChange}
        isRunning={isRunning}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={setActiveFileId}
          onNewFile={() => setNewFileOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
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
