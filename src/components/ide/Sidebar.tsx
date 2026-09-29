import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Settings,
  Upload,
  Cloud,
  CloudOff,
  History,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  RotateCcw,
  Sparkles,
  FolderMinus,
  FilePlus,
} from "lucide-react";
import { languages, detectLanguageFromFilename } from "@/lib/languages";
import { FileTab } from "@/lib/fileSystem";
import { getFileTimeline, formatRelativeTime, type TimelineEntry } from "@/lib/timelineStorage";
import { buildFolderTree, getFileIconInfo, TreeNode } from "@/lib/folderTree";
import { useRef, useState, useEffect, useMemo } from "react";

export type SidebarTab = "explorer" | "search" | "timeline";

interface SidebarProps {
  files: FileTab[];
  activeFileId: string;
  projectName?: string | null;
  isCloudProject?: boolean;
  hasUnsavedChanges?: boolean;
  activeTab?: SidebarTab;
  folders?: string[];
  onSelectFile: (id: string) => void;
  onCreateFile: (name: string, languageId: string) => void;
  onDeleteFile?: (id: string) => void;
  onRenameFile?: (id: string, newName: string) => void;
  onCreateFolder?: (folderPath: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  onRenameFolder?: (oldPath: string, newPath: string) => void;
  onOpenSettings: () => void;
  onUploadFiles?: (files: { name: string; content: string }[]) => void;
  onRestoreSnapshot?: (content: string) => void;
  inlineCreateTrigger?: number;
}

const Sidebar = ({
  files,
  activeFileId,
  projectName,
  isCloudProject,
  hasUnsavedChanges,
  activeTab = "explorer",
  folders = [],
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onOpenSettings,
  onUploadFiles,
  onRestoreSnapshot,
  inlineCreateTrigger,
}: SidebarProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Folder open/closed state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    // Auto-expand any top-level folders initially
    files.forEach((f) => {
      const parts = f.name.split("/").filter(Boolean);
      if (parts.length > 1) {
        let path = "";
        for (let i = 0; i < parts.length - 1; i++) {
          path = path ? `${path}/${parts[i]}` : parts[i];
          initial.add(path);
        }
      }
    });
    return initial;
  });

  // Project root open state
  const [rootExpanded, setRootExpanded] = useState(true);

  // Inline file creation state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [createFileParent, setCreateFileParent] = useState<string>("");
  const [inlineFileName, setInlineFileName] = useState("");

  // Inline folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createFolderParent, setCreateFolderParent] = useState<string>("");
  const [inlineFolderName, setInlineFolderName] = useState("");

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Timeline accordion
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // External trigger for inline file creation (e.g. Ctrl+N)
  useEffect(() => {
    if (inlineCreateTrigger) {
      setIsCreatingFile(true);
      setCreateFileParent("");
      setInlineFileName("");
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    }
  }, [inlineCreateTrigger]);

  // Load timeline for active file
  useEffect(() => {
    if (activeFileId) {
      setTimelineEntries(getFileTimeline(activeFileId));
    } else {
      setTimelineEntries([]);
    }
  }, [activeFileId, hasUnsavedChanges]);

  // Build the hierarchical tree
  const treeNodes = useMemo(() => {
    return buildFolderTree(files, folders);
  }, [files, folders]);

  // Detected language for the inline input as user types
  const detectedLang = inlineFileName.includes(".")
    ? detectLanguageFromFilename(inlineFileName)
    : null;

  // Toggle folder expansion
  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const collapseAllFolders = () => {
    setExpandedFolders(new Set());
  };

  const expandAllFolders = () => {
    const all = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        if (n.isFolder) {
          all.add(n.path);
          if (n.children) collect(n.children);
        }
      });
    };
    collect(treeNodes);
    setExpandedFolders(all);
  };

  // Start creating a file
  const handleStartCreateFile = (parentFolder: string = "") => {
    setCreateFileParent(parentFolder);
    setIsCreatingFile(true);
    setIsCreatingFolder(false);
    setInlineFileName("");
    if (parentFolder) {
      setExpandedFolders((prev) => new Set(prev).add(parentFolder));
    }
    setTimeout(() => inlineInputRef.current?.focus(), 50);
  };

  const handleCommitCreateFile = () => {
    const raw = inlineFileName.trim();
    if (!raw) {
      setIsCreatingFile(false);
      return;
    }
    const fullPath = createFileParent
      ? `${createFileParent}/${raw.replace(/^\/+/, "")}`
      : raw;

    const lang = detectLanguageFromFilename(fullPath);
    const finalName = fullPath.includes(".") ? fullPath : `${fullPath}${lang.extension}`;
    onCreateFile(finalName, lang.id);

    setIsCreatingFile(false);
    setInlineFileName("");
  };

  // Start creating a folder
  const handleStartCreateFolder = (parentFolder: string = "") => {
    setCreateFolderParent(parentFolder);
    setIsCreatingFolder(true);
    setIsCreatingFile(false);
    setInlineFolderName("");
    if (parentFolder) {
      setExpandedFolders((prev) => new Set(prev).add(parentFolder));
    }
    setTimeout(() => folderInputRef.current?.focus(), 50);
  };

  const handleCommitCreateFolder = () => {
    const raw = inlineFolderName.trim().replace(/^\/+|\/+$/g, "");
    if (!raw) {
      setIsCreatingFolder(false);
      return;
    }
    const fullPath = createFolderParent ? `${createFolderParent}/${raw}` : raw;
    if (onCreateFolder) {
      onCreateFolder(fullPath);
    }
    setExpandedFolders((prev) => new Set(prev).add(fullPath));
    setIsCreatingFolder(false);
    setInlineFolderName("");
  };

  // File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !onUploadFiles) return;

    const results: { name: string; content: string }[] = [];
    let remaining = fileList.length;

    Array.from(fileList).forEach((file) => {
      if (file.size > 1024 * 1024) {
        remaining--;
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        results.push({ name: file.name, content: reader.result as string });
        remaining--;
        if (remaining <= 0) onUploadFiles(results);
      };
      reader.readAsText(file);
    });

    e.target.value = "";
  };

  // Active file
  const activeFile = files.find((f) => f.id === activeFileId);

  // Search results
  const searchResults = searchQuery.trim()
    ? files
        .map((f) => {
          const lines = f.content.split("\n");
          const matches: { lineNum: number; text: string }[] = [];
          lines.forEach((l, idx) => {
            if (l.toLowerCase().includes(searchQuery.toLowerCase())) {
              matches.push({ lineNum: idx + 1, text: l.trim() });
            }
          });
          return { file: f, matches };
        })
        .filter((r) => r.matches.length > 0)
    : [];

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const indentPadding = `${depth * 14 + 10}px`;

    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      const isRenaming = renamingId === node.id;

      return (
        <div key={node.id} className="select-none">
          <div
            onClick={() => !isRenaming && toggleFolder(node.path)}
            style={{ paddingLeft: indentPadding }}
            className="group flex w-full items-center gap-1.5 py-1 pr-2 text-[11px] font-mono hover:bg-white/[0.05] transition-colors cursor-pointer rounded text-foreground/80 hover:text-foreground"
          >
            <span className="text-muted-foreground/60 transition-transform duration-150">
              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </span>

            {isExpanded ? (
              <FolderOpen size={13} className="text-amber-400 shrink-0" />
            ) : (
              <Folder size={13} className="text-amber-400/80 shrink-0" />
            )}

            {isRenaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (renameValue.trim() && onRenameFolder) {
                      onRenameFolder(node.path, renameValue.trim());
                    }
                    setRenamingId(null);
                  } else if (e.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
                onBlur={() => {
                  if (renameValue.trim() && onRenameFolder) {
                    onRenameFolder(node.path, renameValue.trim());
                  }
                  setRenamingId(null);
                }}
                autoFocus
                className="flex-1 bg-secondary rounded px-1 text-[11px] outline-none ring-1 ring-primary text-foreground"
              />
            ) : (
              <span
                className="truncate flex-1 font-medium"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(node.id);
                  setRenameValue(node.name);
                }}
                title={node.path}
              >
                {node.name}
              </span>
            )}

            {/* Folder Actions on Hover */}
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartCreateFile(node.path);
                }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-primary hover:bg-white/[0.08]"
                title="New File in this folder"
              >
                <Plus size={11} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartCreateFolder(node.path);
                }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-primary hover:bg-white/[0.08]"
                title="New Subfolder"
              >
                <FolderPlus size={11} />
              </button>
              {onDeleteFolder && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete folder "${node.name}" and its contents?`)) {
                      onDeleteFolder(node.path);
                    }
                  }}
                  className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                  title="Delete Folder"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Children items if expanded */}
          {isExpanded && (
            <div className="tree-indent-guide">
              {/* Inline input inside this folder if active */}
              {isCreatingFile && createFileParent === node.path && (
                <div
                  style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                  className="py-1 pr-2"
                >
                  <div className="flex items-center gap-1.5 rounded bg-secondary/90 px-2 py-1 ring-1 ring-primary">
                    <FileCode size={12} className="text-primary shrink-0" />
                    <input
                      ref={inlineInputRef}
                      type="text"
                      value={inlineFileName}
                      onChange={(e) => setInlineFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitCreateFile();
                        if (e.key === "Escape") setIsCreatingFile(false);
                      }}
                      placeholder="filename.ext"
                      className="w-full bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground/50"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {isCreatingFolder && createFolderParent === node.path && (
                <div
                  style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                  className="py-1 pr-2"
                >
                  <div className="flex items-center gap-1.5 rounded bg-secondary/90 px-2 py-1 ring-1 ring-amber-400">
                    <Folder size={12} className="text-amber-400 shrink-0" />
                    <input
                      ref={folderInputRef}
                      type="text"
                      value={inlineFolderName}
                      onChange={(e) => setInlineFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitCreateFolder();
                        if (e.key === "Escape") setIsCreatingFolder(false);
                      }}
                      placeholder="folder-name"
                      className="w-full bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground/50"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {node.children && node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Render File Node
    const file = node.file!;
    const isActive = file.id === activeFileId;
    const isRenaming = renamingId === file.id;
    const iconInfo = getFileIconInfo(node.name);

    return (
      <div
        key={node.id}
        onClick={() => !isRenaming && onSelectFile(file.id)}
        style={{ paddingLeft: indentPadding }}
        className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-[11px] font-mono transition-all cursor-pointer rounded select-none ${
          isActive
            ? "bg-primary/20 text-foreground font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] border border-primary/30"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        }`}
      >
        {/* Dynamic Extension Badge / Icon */}
        <span className={`text-[10px] font-bold shrink-0 w-3.5 text-center ${iconInfo.badgeColor}`}>
          {iconInfo.symbol}
        </span>

        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (renameValue.trim() && onRenameFile) {
                  onRenameFile(file.id, renameValue.trim());
                }
                setRenamingId(null);
              } else if (e.key === "Escape") {
                setRenamingId(null);
              }
            }}
            onBlur={() => {
              if (renameValue.trim() && onRenameFile) {
                onRenameFile(file.id, renameValue.trim());
              }
              setRenamingId(null);
            }}
            autoFocus
            className="flex-1 bg-secondary rounded px-1 text-[11px] text-foreground outline-none ring-1 ring-primary"
          />
        ) : (
          <span
            className="truncate flex-1"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenamingId(file.id);
              setRenameValue(node.name);
            }}
            title={`${file.name} (Double-click to rename)`}
          >
            {node.name}
          </span>
        )}

        {/* Dirty indicator */}
        {file.isDirty && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
        )}

        {/* Hover action buttons */}
        {!isRenaming && (
          <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-auto">
            {onRenameFile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(file.id);
                  setRenameValue(node.name);
                }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.08]"
                title="Rename file (F2)"
              >
                <Edit2 size={10} />
              </button>
            )}
            {onDeleteFile && files.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                title="Delete file"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-60 flex-col liquid-glass border-r border-white/[0.08] shrink-0 select-none z-10">
      {/* ─── Search Tab View ─── */}
      {activeTab === "search" ? (
        <div className="flex flex-col h-full">
          <div className="border-b border-white/[0.06] px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Search size={12} className="text-primary" />
              Search
            </span>
          </div>
          <div className="p-2.5">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/[0.08] focus-within:border-primary/60 shadow-inner">
              <Search size={12} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across project files..."
                className="w-full bg-transparent text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-2">
            {searchQuery && searchResults.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 text-center py-6">No matches found</p>
            )}
            {searchResults.map(({ file, matches }) => (
              <div key={file.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 space-y-1">
                <button
                  onClick={() => onSelectFile(file.id)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary transition-colors w-full text-left"
                >
                  <FileCode size={12} className="text-primary shrink-0" />
                  <span className="truncate flex-1 font-mono">{file.name}</span>
                  <span className="text-[9px] text-muted-foreground rounded bg-white/[0.06] px-1">{matches.length}</span>
                </button>
                <div className="pl-4 space-y-1">
                  {matches.slice(0, 5).map((m, i) => (
                    <div
                      key={i}
                      onClick={() => onSelectFile(file.id)}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer truncate"
                      title={m.text}
                    >
                      <span className="text-primary/70 mr-1.5">{m.lineNum}:</span>
                      <span>{m.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === "timeline" ? (
        /* ─── Timeline Tab View ─── */
        <div className="flex flex-col h-full">
          <div className="border-b border-white/[0.06] px-3 py-2.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <History size={12} className="text-primary" />
              Timeline History
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">{activeFile?.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {timelineEntries.length === 0 ? (
              <div className="text-center py-10 px-3 text-muted-foreground/60 space-y-1">
                <History size={20} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-[11px]">No timeline revisions recorded yet.</p>
                <p className="text-[10px]">Changes and saves will appear here automatically.</p>
              </div>
            ) : (
              timelineEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 hover:bg-white/[0.06] transition-all space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles size={11} className="text-primary" />
                      {entry.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 font-mono">
                    <span>{entry.lineCount} lines · {entry.charCount} chars</span>
                    {onRestoreSnapshot && (
                      <button
                        onClick={() => onRestoreSnapshot(entry.content)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                        title="Restore this version"
                      >
                        <RotateCcw size={10} />
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* ─── Explorer Tab View (Full VS Code Folder Tree) ─── */
        <div className="flex flex-col h-full">
          {/* Explorer Header Toolbar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2 bg-white/[0.02]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/90">
              Explorer
            </span>
            <div className="flex items-center gap-0.5">
              {/* New File */}
              <button
                onClick={() => handleStartCreateFile("")}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground"
                title="New File"
              >
                <FilePlus size={13} />
              </button>

              {/* New Folder */}
              <button
                onClick={() => handleStartCreateFolder("")}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground"
                title="New Folder"
              >
                <FolderPlus size={13} />
              </button>

              {/* Collapse All */}
              <button
                onClick={collapseAllFolders}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground"
                title="Collapse All Folders"
              >
                <FolderMinus size={13} />
              </button>

              {/* Upload Files */}
              {onUploadFiles && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".py,.js,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.sh,.bat"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground"
                    title="Upload Files"
                  >
                    <Upload size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-1.5 py-1.5 flex flex-col justify-between">
            <div>
              {/* Root Project Folder Row */}
              <div
                onClick={() => setRootExpanded((prev) => !prev)}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold text-foreground/90 hover:bg-white/[0.05] transition-colors cursor-pointer group mb-1"
              >
                <span className="text-muted-foreground/60">
                  {rootExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
                <FolderOpen size={13} className="text-primary shrink-0" />
                <span className="truncate flex-1 font-bold tracking-tight">
                  {projectName || "zuup-project"}
                </span>

                {isCloudProject && (
                  <span title={hasUnsavedChanges ? "Unsaved changes" : "Saved to cloud"}>
                    {hasUnsavedChanges ? (
                      <CloudOff size={11} className="text-amber-400/80" />
                    ) : (
                      <Cloud size={11} className="text-emerald-400/80" />
                    )}
                  </span>
                )}
              </div>

              {/* Tree Content */}
              {rootExpanded && (
                <div className="space-y-0.5">
                  {/* Inline creation at root level */}
                  {isCreatingFile && !createFileParent && (
                    <div className="pl-5 pr-2 py-1">
                      <div className="flex items-center gap-1.5 rounded bg-secondary/90 px-2 py-1 ring-1 ring-primary">
                        <FileCode size={12} className="text-primary shrink-0" />
                        <input
                          ref={inlineInputRef}
                          type="text"
                          value={inlineFileName}
                          onChange={(e) => setInlineFileName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitCreateFile();
                            if (e.key === "Escape") setIsCreatingFile(false);
                          }}
                          placeholder="filename.ext"
                          className="w-full bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground/50"
                          autoFocus
                        />
                      </div>
                    </div>
                  )}

                  {isCreatingFolder && !createFolderParent && (
                    <div className="pl-5 pr-2 py-1">
                      <div className="flex items-center gap-1.5 rounded bg-secondary/90 px-2 py-1 ring-1 ring-amber-400">
                        <Folder size={12} className="text-amber-400 shrink-0" />
                        <input
                          ref={folderInputRef}
                          type="text"
                          value={inlineFolderName}
                          onChange={(e) => setInlineFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitCreateFolder();
                            if (e.key === "Escape") setIsCreatingFolder(false);
                          }}
                          placeholder="folder-name"
                          className="w-full bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground/50"
                          autoFocus
                        />
                      </div>
                    </div>
                  )}

                  {/* Hierarchical Nodes */}
                  {treeNodes.map((node) => renderTreeNode(node, 0))}
                </div>
              )}
            </div>

            {/* ─── Timeline Accordion at bottom ─── */}
            <div className="mt-4 border-t border-white/[0.06] pt-2">
              <button
                onClick={() => setTimelineOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  {timelineOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <span className="flex items-center gap-1">
                    <History size={11} className="text-primary/70" />
                    Timeline
                  </span>
                </div>
                {timelineEntries.length > 0 && (
                  <span className="rounded bg-white/[0.08] px-1 text-[9px] text-muted-foreground font-mono">
                    {timelineEntries.length}
                  </span>
                )}
              </button>

              {timelineOpen && (
                <div className="mt-1 space-y-1 max-h-36 overflow-y-auto pl-1 pr-1">
                  {timelineEntries.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/50 py-2 text-center">
                      No history snapshots yet
                    </p>
                  ) : (
                    timelineEntries.slice(0, 8).map((entry) => (
                      <div
                        key={entry.id}
                        className="group flex items-center justify-between rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors"
                      >
                        <span className="truncate flex-1 font-mono">
                          {entry.label} · {formatRelativeTime(entry.timestamp)}
                        </span>
                        {onRestoreSnapshot && (
                          <button
                            onClick={() => onRestoreSnapshot(entry.content)}
                            className="opacity-0 group-hover:opacity-100 text-primary hover:underline ml-1 shrink-0 flex items-center gap-0.5"
                            title="Restore snapshot"
                          >
                            <RotateCcw size={9} />
                            Restore
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Settings Footer */}
          <div className="border-t border-white/[0.06] p-2 bg-white/[0.01]">
            <button
              onClick={onOpenSettings}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <Settings size={13} />
              <span>Settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
