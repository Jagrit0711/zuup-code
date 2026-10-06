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
  X,
  Search,
  RotateCcw,
  Sparkles,
  FolderMinus,
  FilePlus,
} from "lucide-react";
import { detectLanguageFromFilename, getLanguageById } from "@/lib/languages";
import { FileTab, readTextFiles } from "@/lib/fileSystem";
import { ancestorFolders, ensureExtension, type ActionResult } from "@/lib/fileNames";
import { getFileTimeline, formatRelativeTime, type TimelineEntry } from "@/lib/timelineStorage";
import { buildFolderTree, getFileIconInfo, TreeNode } from "@/lib/folderTree";
import { useRef, useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

export type SidebarTab = "explorer" | "search" | "timeline";

interface SidebarProps {
  files: FileTab[];
  activeFileId: string;
  projectName?: string | null;
  isCloudProject?: boolean;
  hasUnsavedChanges?: boolean;
  activeTab?: SidebarTab;
  folders?: string[];
  /** Language whose extension is appended when a new file name has none. */
  defaultLanguageId?: string;
  onSelectFile: (id: string) => void;
  /** `rawName` is exactly what the user typed; the parent validates it and resolves the final path. */
  onCreateFile: (rawName: string, parentFolder: string) => ActionResult;
  onDeleteFile?: (id: string) => void;
  /** `newName` is the new last path segment only. */
  onRenameFile?: (id: string, newName: string) => ActionResult;
  onCreateFolder?: (rawName: string, parentFolder: string) => ActionResult;
  onDeleteFolder?: (folderPath: string) => void;
  /** `newName` is the new last path segment only. */
  onRenameFolder?: (folderPath: string, newName: string) => ActionResult;
  onOpenSettings: () => void;
  onUploadFiles?: (files: { name: string; content: string }[]) => void;
  onRestoreSnapshot?: (content: string) => void;
  inlineCreateTrigger?: number;
}

type CreateState = { kind: "file" | "folder"; parent: string } | null;
type RenameState = { id: string; kind: "file" | "folder"; path: string } | null;

const ACCEPTED_EXTENSIONS =
  ".py,.js,.mjs,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.hpp,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.cs,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.csv,.sh,.pl,.scala,.hs,.clj,.ex,.exs,.nim";

const Sidebar = ({
  files,
  activeFileId,
  projectName,
  isCloudProject,
  hasUnsavedChanges,
  activeTab = "explorer",
  folders = [],
  defaultLanguageId = "python",
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
  const createInputRef = useRef<HTMLInputElement>(null);

  // Folder open/closed state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    files.forEach((f) => ancestorFolders(f.name).forEach((p) => initial.add(p)));
    return initial;
  });

  // Project root open state
  const [rootExpanded, setRootExpanded] = useState(true);

  // Inline creation (file or folder) state
  const [creating, setCreating] = useState<CreateState>(null);
  const [createValue, setCreateValue] = useState("");
  const [createError, setCreateError] = useState("");

  // Inline rename state
  const [renaming, setRenaming] = useState<RenameState>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const renameBusyRef = useRef(false);

  // Timeline accordion
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  const activeFile = files.find((f) => f.id === activeFileId);
  const activeFilePath = activeFile?.name ?? "";

  // Start creating (used by toolbar buttons, folder hover buttons and the external trigger)
  const startCreate = (kind: "file" | "folder", parent: string = "") => {
    setCreating({ kind, parent });
    setCreateValue("");
    setCreateError("");
    setRenaming(null);
    setRootExpanded(true);
    if (parent) {
      setExpandedFolders((prev) => new Set(prev).add(parent));
    }
  };

  // External trigger for inline file creation (Ctrl+N, TopBar menu, empty state).
  // The value present on mount is treated as already handled so re-opening the sidebar
  // doesn't pop an input open.
  const lastTriggerRef = useRef(inlineCreateTrigger);
  useEffect(() => {
    if (inlineCreateTrigger !== lastTriggerRef.current) {
      lastTriggerRef.current = inlineCreateTrigger;
      startCreate("file", "");
    }
  }, [inlineCreateTrigger]);

  // Focus the inline input whenever creation starts.
  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  // Keep the active file visible: expand every folder above it when it changes.
  useEffect(() => {
    const parents = ancestorFolders(activeFilePath);
    if (parents.length === 0) return;
    setExpandedFolders((prev) => {
      if (parents.every((p) => prev.has(p))) return prev;
      const next = new Set(prev);
      parents.forEach((p) => next.add(p));
      return next;
    });
  }, [activeFilePath]);

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

  // Live hint under the inline file input: what the final name and language will be.
  const createHint = (() => {
    if (!creating || creating.kind !== "file" || createValue.trim() === "") return "";
    const name = ensureExtension(createValue.trim(), getLanguageById(defaultLanguageId).extension);
    return `${name} · ${detectLanguageFromFilename(name).label}`;
  })();

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

  const handleCommitCreate = () => {
    if (!creating) return;
    const raw = createValue;
    if (raw === "") {
      setCreating(null);
      return;
    }
    const result: ActionResult =
      creating.kind === "file"
        ? onCreateFile(raw, creating.parent)
        : onCreateFolder
          ? onCreateFolder(raw, creating.parent)
          : { ok: false, error: "Folders can't be created here." };

    if (result.ok === false) {
      setCreateError(result.error);
      return;
    }
    if (creating.kind === "folder") {
      // Reveal the new folder (and anything above it).
      const target = creating.parent ? `${creating.parent}/${raw}` : raw;
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        ancestorFolders(`${target}/x`).forEach((p) => next.add(p));
        return next;
      });
    }
    setCreating(null);
    setCreateValue("");
    setCreateError("");
  };

  const startRename = (kind: "file" | "folder", id: string, path: string, currentName: string) => {
    renameBusyRef.current = false;
    setCreating(null);
    setRenaming({ id, kind, path });
    setRenameValue(currentName);
    setRenameError("");
  };

  const finishRename = (commit: boolean) => {
    if (!renaming || renameBusyRef.current) return;
    if (!commit) {
      // Block the blur that follows unmounting the input from committing the edit.
      renameBusyRef.current = true;
      setRenaming(null);
      return;
    }
    const handler = renaming.kind === "file" ? onRenameFile : onRenameFolder;
    if (!handler) {
      setRenaming(null);
      return;
    }
    renameBusyRef.current = true;
    const result = handler(renaming.kind === "file" ? renaming.id : renaming.path, renameValue);
    if (result.ok === false) {
      renameBusyRef.current = false;
      setRenameError(result.error);
      return;
    }
    setRenaming(null);
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !onUploadFiles) return;
    const { files: read, skipped } = await readTextFiles(fileList);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (skipped.length > 0) {
      toast.error(`Skipped ${skipped.length} file${skipped.length > 1 ? "s" : ""}`, {
        description: "Only text files up to 1 MB can be imported.",
      });
    }
    if (read.length > 0) onUploadFiles(read);
  };

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

  // Inline "new file / new folder" row, shown inside the folder it targets
  const renderCreateRow = (parent: string, paddingLeft: string) => {
    if (!creating || creating.parent !== parent) return null;
    const isFile = creating.kind === "file";
    return (
      <div style={{ paddingLeft }} className="py-1 pr-2">
        <div
          className={`flex items-center gap-1.5 rounded bg-secondary/90 px-2 py-1 ring-1 ${
            createError ? "ring-destructive" : isFile ? "ring-primary" : "ring-amber-400"
          }`}
        >
          {isFile ? (
            <FileCode size={12} className="text-primary shrink-0" />
          ) : (
            <Folder size={12} className="text-amber-400 shrink-0" />
          )}
          <input
            ref={createInputRef}
            type="text"
            value={createValue}
            onChange={(e) => {
              setCreateValue(e.target.value);
              if (createError) setCreateError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCommitCreate();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setCreating(null);
              }
            }}
            onBlur={() => {
              if (createValue === "") setCreating(null);
            }}
            placeholder={isFile ? "filename.ext" : "folder-name"}
            aria-label={isFile ? "New file name" : "New folder name"}
            aria-invalid={createError ? true : undefined}
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        {createError ? (
          <p role="alert" className="mt-1 px-1 text-[10px] leading-snug text-destructive">
            {createError}
          </p>
        ) : createHint ? (
          <p className="mt-1 truncate px-1 text-[10px] text-muted-foreground/70" title={createHint}>
            {createHint}
          </p>
        ) : null}
      </div>
    );
  };

  const renderRenameInput = () => (
    <div className="flex-1 min-w-0">
      <input
        type="text"
        value={renameValue}
        onChange={(e) => {
          setRenameValue(e.target.value);
          if (renameError) setRenameError("");
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            finishRename(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finishRename(false);
          }
        }}
        onBlur={() => {
          // Leaving the field commits a changed name; a rejected name just closes the editor.
          if (renameBusyRef.current) return;
          if (renameError) {
            setRenaming(null);
            return;
          }
          finishRename(true);
        }}
        onFocus={(e) => e.currentTarget.select()}
        autoFocus
        aria-label="New name"
        aria-invalid={renameError ? true : undefined}
        spellCheck={false}
        className={`w-full bg-secondary rounded px-1 text-[11px] text-foreground outline-none ring-1 ${renameError ? "ring-destructive" : "ring-primary"}`}
      />
      {renameError && (
        <p role="alert" className="mt-0.5 text-[10px] leading-snug text-destructive whitespace-normal">
          {renameError}
        </p>
      )}
    </div>
  );

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const indentPadding = `${depth * 14 + 10}px`;

    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      const isRenaming = renaming?.kind === "folder" && renaming.path === node.path;

      return (
        <div key={node.id} className="select-none" role="none">
          <div
            role="treeitem"
            aria-expanded={isExpanded}
            tabIndex={0}
            onClick={() => !isRenaming && toggleFolder(node.path)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleFolder(node.path);
              } else if (e.key === "F2" && onRenameFolder) {
                e.preventDefault();
                startRename("folder", node.id, node.path, node.name);
              } else if (e.key === "Delete" && onDeleteFolder) {
                e.preventDefault();
                onDeleteFolder(node.path);
              }
            }}
            style={{ paddingLeft: indentPadding }}
            className="group flex w-full items-center gap-1.5 py-1 pr-2 text-[11px] font-mono hover:bg-white/[0.05] transition-colors cursor-pointer rounded text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
              renderRenameInput()
            ) : (
              <span
                className="truncate flex-1 font-medium"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (onRenameFolder) startRename("folder", node.id, node.path, node.name);
                }}
                title={node.path}
              >
                {node.name}
              </span>
            )}

            {/* Folder Actions on Hover / keyboard focus / touch */}
            {!isRenaming && (
              <div className="hidden group-hover:flex group-focus-within:flex [@media(hover:none)]:flex items-center gap-1 shrink-0 ml-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startCreate("file", node.path);
                  }}
                  className="rounded p-0.5 text-muted-foreground/60 hover:text-primary hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  title="New File in this folder"
                  aria-label={`New file in ${node.name}`}
                >
                  <Plus size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startCreate("folder", node.path);
                  }}
                  className="rounded p-0.5 text-muted-foreground/60 hover:text-primary hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  title="New Subfolder"
                  aria-label={`New subfolder in ${node.name}`}
                >
                  <FolderPlus size={11} />
                </button>
                {onRenameFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename("folder", node.id, node.path, node.name);
                    }}
                    className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    title="Rename folder (F2)"
                    aria-label={`Rename folder ${node.name}`}
                  >
                    <Edit2 size={10} />
                  </button>
                )}
                {onDeleteFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFolder(node.path);
                    }}
                    className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    title="Delete folder"
                    aria-label={`Delete folder ${node.name}`}
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Children items if expanded */}
          {isExpanded && (
            <div className="tree-indent-guide" role="group">
              {renderCreateRow(node.path, `${(depth + 1) * 14 + 10}px`)}
              {node.children && node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Render File Node
    const file = node.file!;
    const isActive = file.id === activeFileId;
    const isRenaming = renaming?.kind === "file" && renaming.id === file.id;
    const iconInfo = getFileIconInfo(node.name);

    return (
      <div
        key={node.id}
        role="treeitem"
        aria-selected={isActive}
        tabIndex={0}
        onClick={() => !isRenaming && onSelectFile(file.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectFile(file.id);
          } else if (e.key === "F2" && onRenameFile) {
            e.preventDefault();
            startRename("file", file.id, file.name, node.name);
          } else if (e.key === "Delete" && onDeleteFile) {
            e.preventDefault();
            onDeleteFile(file.id);
          }
        }}
        style={{ paddingLeft: indentPadding }}
        className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-[11px] font-mono transition-all cursor-pointer rounded select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
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
          renderRenameInput()
        ) : (
          <span
            className="truncate flex-1"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onRenameFile) startRename("file", file.id, file.name, node.name);
            }}
            title={`${file.name} (Double-click or F2 to rename)`}
          >
            {node.name}
          </span>
        )}

        {/* Dirty indicator */}
        {file.isDirty && !isRenaming && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
        )}

        {/* Hover action buttons */}
        {!isRenaming && (
          <div className="hidden group-hover:flex group-focus-within:flex [@media(hover:none)]:flex items-center gap-1 shrink-0 ml-auto">
            {onRenameFile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startRename("file", file.id, file.name, node.name);
                }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="Rename file (F2)"
                aria-label={`Rename ${node.name}`}
              >
                <Edit2 size={10} />
              </button>
            )}
            {onDeleteFile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="Delete file (Del)"
                aria-label={`Delete ${node.name}`}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const isWorkspaceEmpty = files.length === 0 && folders.length === 0;

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
                aria-label="Search across project files"
                className="w-full bg-transparent text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-2">
            {files.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 text-center py-6">No files to search yet</p>
            )}
            {searchQuery && files.length > 0 && searchResults.length === 0 && (
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
            <span className="text-[10px] text-muted-foreground font-mono truncate ml-2">{activeFile?.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {timelineEntries.length === 0 ? (
              <div className="text-center py-10 px-3 text-muted-foreground/60 space-y-1">
                <History size={20} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-[11px]">
                  {activeFile ? "No timeline revisions recorded yet." : "Open a file to see its history."}
                </p>
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
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
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
                onClick={() => startCreate("file", "")}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="New File"
                aria-label="New file"
              >
                <FilePlus size={13} />
              </button>

              {/* New Folder */}
              <button
                onClick={() => startCreate("folder", "")}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="New Folder"
                aria-label="New folder"
              >
                <FolderPlus size={13} />
              </button>

              {/* Collapse All */}
              <button
                onClick={collapseAllFolders}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="Collapse All Folders"
                aria-label="Collapse all folders"
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
                    accept={ACCEPTED_EXTENSIONS}
                    aria-label="Upload files"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    title="Upload Files"
                    aria-label="Upload files"
                  >
                    <Upload size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-1.5 py-1.5 flex flex-col justify-between">
            <div role="tree" aria-label="Project files">
              {/* Root Project Folder Row */}
              <div
                role="treeitem"
                aria-expanded={rootExpanded}
                tabIndex={0}
                onClick={() => setRootExpanded((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setRootExpanded((prev) => !prev);
                  }
                }}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold text-foreground/90 hover:bg-white/[0.05] transition-colors cursor-pointer group mb-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
                <div className="space-y-0.5" role="group">
                  {/* Inline creation at root level */}
                  {renderCreateRow("", "20px")}

                  {/* Empty workspace hint */}
                  {isWorkspaceEmpty && !creating && (
                    <div className="px-3 py-4 text-center">
                      <p className="text-[11px] text-muted-foreground/70">This workspace is empty.</p>
                      <button
                        onClick={() => startCreate("file", "")}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      >
                        <FilePlus size={12} />
                        New file
                      </button>
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
                aria-expanded={timelineOpen}
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
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-primary hover:underline ml-1 shrink-0 flex items-center gap-0.5"
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
