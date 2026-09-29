import { useState, useCallback, useEffect, useRef } from "react";
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
import SettingsModal from "@/components/ide/SettingsModal";
import NewFileModal from "@/components/ide/NewFileModal";
import NewProjectModal from "@/components/ide/NewProjectModal";
import type { NewProjectData } from "@/components/ide/NewProjectModal";
import ShareModal from "@/components/ide/ShareModal";
import { getLanguageById, languages, detectNeedsStdin } from "@/lib/languages";
import { FileTab, createFile, downloadFile, copyToClipboard } from "@/lib/fileSystem";
import { executeCode } from "@/lib/pistonApi";
import { loadSharedCode, loadSharedProject, clearUrlParams } from "@/lib/sharing";
import { recordSnapshot } from "@/lib/timelineStorage";
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

// Dynamic extension → languageId — uses the languages registry so it's always in sync
function extToLangId(ext: string): string {
  return languages.find((l) => l.extension === `.${ext}`)?.id ?? "plaintext";
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
    const ext = name.split(".").pop()?.toLowerCase() || "";
    // Always empty — the user's code writes the real content
    found.push({ name, langId: extToLangId(ext), content: "" });
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

const Index = () => {
  const { user, profile, loading, signInWithZuup } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Enforce authentication for accessing the code editor
  useEffect(() => {
    if (!loading && !user) {
      const redirectPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirectPath}`;
    }
  }, [user, loading]);

  // File management
  const [files, setFiles] = useState<FileTab[]>(() => {
    const defaultLang = getLanguageById("python");
    return [createFile("main.py", "python", defaultLang.defaultCode)];
  });
  const [activeFileId, setActiveFileId] = useState("");

  // Program standard input (stdin) for scanf, cin, input(), etc.
  const [programStdin, setProgramStdin] = useState("");
  const [stdinRequestTrigger, setStdinRequestTrigger] = useState(0);

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
  const [isRunning, setIsRunning] = useState(false);
  // Lines pushed into the terminal after execution
  const [terminalExternalLines, setTerminalExternalLines] = useState<{ text: string; type: "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt" }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // VS Code Layout State
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inlineCreateTrigger, setInlineCreateTrigger] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });

  // Settings
  const [fontSize, setFontSize] = useState(14);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(false);

  // Check for shared code or project in URL or forked project on component mount
  useEffect(() => {
    // Check for forked project from ShareView
    try {
      const forkRaw = localStorage.getItem("zuup_fork_project");
      if (forkRaw) {
        const forkData = JSON.parse(forkRaw);
        if (forkData && forkData.files && forkData.files.length > 0) {
          const newFiles = forkData.files.map((f: any) =>
            createFile(f.fileName, f.language, f.code)
          );
          setFiles(newFiles);
          setActiveFileId(newFiles[0].id);
          setProjectName(forkData.name || "Forked Project");
          localStorage.removeItem("zuup_fork_project");
          toast.success(`Forked project loaded in Zuup Code! 🚀`);
          return;
        }
      }
    } catch (e) {
      console.warn("Error loading fork project:", e);
    }

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
    const lang = getLanguageById(languageId);
    const file = createFile(name, languageId, lang.defaultCode || "");
    setFiles((prev) => [...prev, file]);
    setActiveFileId(file.id);
    recordSnapshot(file.id, file.name, file.content, "Created");
    toast.success(`Created ${name}`);
  }, []);

  const handleDeleteFile = useCallback((id: string) => {
    setFiles((prev) => {
      if (prev.length <= 1) {
        toast.error("Cannot delete the only file in project");
        return prev;
      }
      const fileToDelete = prev.find((f) => f.id === id);
      const next = prev.filter((f) => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(next[next.length - 1].id);
      }
      toast.success(`Deleted ${fileToDelete?.name || "file"}`);
      return next;
    });
    setHasUnsavedChanges(true);
  }, [activeFileId]);

  const handleRenameFile = useCallback((id: string, newName: string) => {
    const ext = newName.includes(".") ? `.${newName.split(".").pop()?.toLowerCase()}` : "";
    const lang = languages.find((l) => l.extension === ext);
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          return {
            ...f,
            name: newName,
            languageId: lang ? lang.id : f.languageId,
            isDirty: true,
          };
        }
        return f;
      })
    );
    setHasUnsavedChanges(true);
    toast.success(`Renamed file to ${newName}`);
  }, []);

  const handleRestoreSnapshot = useCallback(
    (content: string) => {
      if (!activeFile) return;
      updateFileContent(content);
      recordSnapshot(activeFile.id, activeFile.name, content, "Restored");
      toast.success(`Restored version of ${activeFile.name}`);
    },
    [activeFile, updateFileContent]
  );

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
      // Blank project for the selected language
      const selectedLang = getLanguageById(data.language);
      const defaultFileName = `main${selectedLang.extension}`;
      projectFiles = [
        createFile(defaultFileName, selectedLang.id, selectedLang.defaultCode)
      ];
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
          toast.success("Saved to cloud ☁️");
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

  const handleSave = useCallback(() => {
    if (!user) {
      toast.error("You must be logged in with your Zuup Account to save code.", {
        action: {
          label: "Sign in with Zuup",
          onClick: () => signInWithZuup(window.location.pathname + window.location.search),
        },
      });
      return;
    }
    if (!activeFile) return;
    setFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, isDirty: false } : f)));
    recordSnapshot(activeFile.id, activeFile.name, activeFile.content, "Saved");
    performCloudSave();
  }, [activeFileId, activeFile?.name, activeFile?.content, user, signInWithZuup, performCloudSave]);

  // Upload files into current project
  const handleUploadFiles = useCallback((uploadedFiles: { name: string; content: string }[]) => {
    const newFiles = uploadedFiles.map(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const lang = languages.find(l => l.extension === `.${ext}`)?.id || activeFile?.languageId || "python";
      return createFile(f.name, lang, f.content);
    });
    setFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length > 0) setActiveFileId(newFiles[0].id);
    setHasUnsavedChanges(true);
    toast.success(`Added ${newFiles.length} file${newFiles.length > 1 ? "s" : ""}`);
  }, [activeFile?.languageId]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    downloadFile(activeFile.name, activeFile.content);
    toast.success(`Downloaded ${activeFile.name}`);
  }, [activeFile]);

  const handleShare = useCallback(() => {
    setShareModalOpen(true);
  }, []);

  const handleRun = useCallback(async (customStdin?: unknown) => {
    if (!activeFile) return;

    if (activeFile.languageId === "html" || activeFile.languageId === "css") {
      setTerminalExternalLines([{ text: "[OK] Rendered in preview panel.", type: "success" }]);
      return;
    }

    // Safely check if customStdin is an actual string (prevents React MouseEvent crash!)
    const stdinArg: string | undefined = typeof customStdin === "string" ? customStdin : undefined;

    const needsStdin = detectNeedsStdin(activeFile.content, activeFile.languageId);

    // If program expects input and none was provided yet, prompt directly in the terminal!
    if (needsStdin && stdinArg === undefined && !(programStdin || "").trim()) {
      setTerminalExternalLines([
        { text: `▶ Running ${activeFile.name} (${activeLanguage.label})…`, type: "info" },
        { text: "⌨ Program waiting for input (scanf / input()).", type: "info" },
        { text: "Type your input below and press Enter to execute (or Shift+Enter for multiline):", type: "stdin-prompt" },
      ]);
      setStdinRequestTrigger(Date.now());
      return;
    }

    setIsRunning(true);
    const activeStdin = stdinArg !== undefined ? stdinArg : (typeof programStdin === "string" ? programStdin : "");
    const initialLines: { text: string; type: "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt" }[] = [
      { text: `▶ Running ${activeFile.name} (${activeLanguage.label})…`, type: "info" }
    ];
    if (activeStdin.trim()) {
      initialLines.push({
        text: `📥 Input: ${activeStdin.trim().replace(/\n/g, " ")}`,
        type: "stdin-prompt",
      });
    }
    setTerminalExternalLines(initialLines);

    // Record snapshot on execution
    recordSnapshot(activeFile.id, activeFile.name, activeFile.content, "Code Run");

    try {
      if (activeLanguage.pistonLang) {
        const stdinToPass = activeStdin.trim() ? activeStdin : undefined;
        const result = await executeCode(activeLanguage.pistonLang, activeLanguage.pistonVersion, activeFile.content, stdinToPass);
        const resultLines: { text: string; type: "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt" }[] = [
          ...result.output.flatMap((line) =>
            line.split("\n").map((l) => ({
              text: l,
              type: (l.startsWith("❌") || l.toLowerCase().includes("error") || l.toLowerCase().includes("traceback")
                ? "error" : "output") as "output" | "error",
            }))
          ),
          { text: "", type: "output" },
          { text: result.success ? "✅ Execution completed." : "❌ Execution failed.", type: result.success ? "success" : "error" },
        ];

        // If program failed due to EOF / missing input, prompt in terminal to re-run:
        if (!stdinToPass && result.output.some(l => l.includes("EOFError") || l.includes("EOF") || l.includes("NoSuchElementException"))) {
          resultLines.push({
            text: "💡 Program halted waiting for input. Type input below and press Enter to re-run:",
            type: "stdin-prompt",
          });
          setStdinRequestTrigger(Date.now());
        }

        setTerminalExternalLines(resultLines);

        if (result.success) {
          const created = detectCreatedFiles(activeFile.content, activeFile.languageId, result.output);
          if (created.length > 0) {
            setFiles((prev) => {
              let updated = [...prev];
              const added: string[] = [];
              for (const cf of created) {
                if (!updated.find((f) => f.name === cf.name)) {
                  updated = [...updated, createFile(cf.name, cf.langId, "")];
                  added.push(cf.name);
                }
              }
              if (added.length > 0) {
                toast.success(
                  `📄 ${added.length === 1 ? `"${added[0]}"` : `${added.length} files`} added to Explorer`,
                  { description: "Created by your code" }
                );
              }
              return updated;
            });
            setHasUnsavedChanges(true);
          }
        }
      } else {
        setTerminalExternalLines([{ text: "[WARN] No runtime available for this language.", type: "info" }]);
      }
    } catch (err: any) {
      console.error("Execution error:", err);
      setTerminalExternalLines([
        { text: `❌ Execution error: ${err?.message || "Failed to contact execution server"}`, type: "error" },
        { text: "Check your internet connection or try again.", type: "info" },
      ]);
    } finally {
      setIsRunning(false);
    }
  }, [activeLanguage, activeFile, programStdin]);

  const handleClearOutput = useCallback(() => {
    setTerminalExternalLines([{ text: "Terminal cleared.", type: "info" }]);
  }, []);

  const handleTerminalCommand = useCallback(async (cmd: string) => {
    // Helper: run code and push results into terminal lines
    const runInTerminal = async (code: string, stdin?: string) => {
      if (!activeFile || !activeLanguage?.pistonLang) {
        setTerminalExternalLines([{ text: "❌ No active file to run, or language has no runtime.", type: "error" }]);
        return;
      }
      setIsRunning(true);
      setTerminalExternalLines([
        { text: `▶ Running ${activeFile.name} (${activeLanguage.label})…`, type: "info" },
      ]);

      const result = await executeCode(activeLanguage.pistonLang, activeLanguage.pistonVersion, code, stdin);
      const resultLines: { text: string; type: "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt" }[] = [
        ...result.output.flatMap((line) =>
          line.split("\n").map((l) => ({
            text: l,
            type: (l.startsWith("❌") || l.toLowerCase().includes("error") || l.toLowerCase().includes("traceback")
              ? "error"
              : "output") as "output" | "error",
          }))
        ),
        { text: "", type: "output" },
        {
          text: result.success ? "✅ Execution completed." : "❌ Execution failed.",
          type: result.success ? "success" : "error",
        },
      ];
      setTerminalExternalLines(resultLines);

      // ── Auto-add files created by the program to the Explorer ──
      if (result.success) {
        const created = detectCreatedFiles(activeFile.content, activeFile.languageId, result.output);
        if (created.length > 0) {
          setFiles((prev) => {
            let updated = [...prev];
            const added: string[] = [];
            for (const cf of created) {
              if (!updated.find((f) => f.name === cf.name)) {
                updated = [...updated, createFile(cf.name, cf.langId, cf.content)];
                added.push(cf.name);
              }
            }
            if (added.length > 0) {
              toast.success(
                `📄 ${added.length === 1 ? `"${added[0]}"` : `${added.length} files`} added to Explorer`,
                { description: "Created by your code" }
              );
            }
            return updated;
          });
          setHasUnsavedChanges(true);
        }
      }

      setIsRunning(false);
    };

    // Plain "run" — run the active file, output stays in Terminal tab
    if (cmd === "run") {
      if (!activeFile) return;
      // HTML/CSS: just show a note
      if (activeFile.languageId === "html" || activeFile.languageId === "css") {
        setTerminalExternalLines([{ text: "[OK] Rendered in preview panel.", type: "success" }]);
        return;
      }
      await runInTerminal(activeFile.content);
      return;
    }

    // "run-with-stdin:<b64stdin>" — execute active file with captured stdin
    if (cmd.startsWith("run-with-stdin:")) {
      if (!activeFile || !activeLanguage?.pistonLang) {
        setTerminalExternalLines([{ text: "❌ No active file to run, or language has no runtime.", type: "error" }]);
        return;
      }
      const b64stdin = cmd.slice("run-with-stdin:".length);
      let stdin = "";
      try { stdin = decodeURIComponent(escape(atob(b64stdin))); } catch { stdin = b64stdin; }
      setProgramStdin(stdin);
      await runInTerminal(activeFile.content, stdin);
    }
  }, [activeFile, activeLanguage]);

  const handleActivityTabChange = (tab: SidebarTab) => {
    if (activeSidebarTab === tab && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveSidebarTab(tab);
      setSidebarOpen(true);
    }
  };

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
        setInlineCreateTrigger(Date.now());
        setSidebarOpen(true);
        setActiveSidebarTab("explorer");
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
        onRun={() => handleRun()}
        onSave={handleSave}
        onDownload={handleDownload}
        onShare={handleShare}
        onNewFile={() => {
          setInlineCreateTrigger(Date.now());
          setSidebarOpen(true);
          setActiveSidebarTab("explorer");
        }}
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
        {/* VS Code Left Activity Bar */}
        <ActivityBar
          activeTab={activeSidebarTab}
          sidebarOpen={sidebarOpen}
          onTabChange={handleActivityTabChange}
          onOpenSettings={() => setSettingsOpen(true)}
          user={user}
          profile={profile}
        />

        {/* VS Code Sidebar (Explorer / Search / Timeline) */}
        {sidebarOpen && (
          <Sidebar
            files={files}
            activeFileId={activeFileId}
            projectName={projectName}
            isCloudProject={!!cloudProjectId}
            hasUnsavedChanges={hasUnsavedChanges}
            activeTab={activeSidebarTab}
            onSelectFile={setActiveFileId}
            onCreateFile={handleNewFile}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onOpenSettings={() => setSettingsOpen(true)}
            onUploadFiles={handleUploadFiles}
            onRestoreSnapshot={handleRestoreSnapshot}
            inlineCreateTrigger={inlineCreateTrigger}
          />
        )}

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
                      onClick={() => {
                        setInlineCreateTrigger(Date.now());
                        setSidebarOpen(true);
                        setActiveSidebarTab("explorer");
                      }}
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
                    onCursorChange={setCursorPosition}
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
                    onClear={handleClearOutput}
                    onCommand={handleTerminalCommand}
                    isRunning={isRunning}
                    fileContent={activeFile?.content ?? ""}
                    fileLang={activeFile?.languageId ?? ""}
                    externalLines={terminalExternalLines}
                    requestStdin={stdinRequestTrigger}
                  />
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-border/50 hover:bg-primary/30 transition-colors cursor-col-resize flex items-center justify-center">
                  <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30" />
                </PanelResizeHandle>
                <Panel defaultSize={50} minSize={20}>
                  <HtmlPreview code={activeFile?.content || ""} />
                </Panel>
              </PanelGroup>
            ) : (
              <TerminalPanel
                onClear={handleClearOutput}
                onCommand={handleTerminalCommand}
                isRunning={isRunning}
                fileContent={activeFile?.content ?? ""}
                fileLang={activeFile?.languageId ?? ""}
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
        tabSize={tabSize}
        languageLabel={activeLanguage.label}
        isCloudProject={!!cloudProjectId}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onLanguageClick={() => setSettingsOpen(true)}
      />

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
