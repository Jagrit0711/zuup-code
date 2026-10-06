import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  ListCollapse,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { detectLanguageFromFilename, getLanguageById } from "@/lib/languages";
import { FileTab, readTextFiles } from "@/lib/fileSystem";
import { ancestorFolders, ensureExtension, type ActionResult } from "@/lib/fileNames";
import { getFileTimeline, formatRelativeTime, type TimelineEntry } from "@/lib/timelineStorage";
import { buildFolderTree, TreeNode } from "@/lib/folderTree";
import IconButton from "@/components/ide/panel/IconButton";
import { fileGlyph } from "@/components/ide/panel/fileGlyph";
import { cn } from "@/lib/utils";
import { useRef, useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { shortcutFor } from "@/components/ide/palette/shortcuts";

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
    return `${name} (${detectLanguageFromFilename(name).label})`;
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
  const INDENT = 12;
  const rowPad = (depth: number) => `${depth * INDENT + 8}px`;

  const rowBase =
    "group relative flex h-[22px] w-full cursor-pointer items-center gap-1.5 pr-1.5 text-[13px] outline-none transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary";

  const inputClass = (invalid: boolean) =>
    cn(
      "h-[22px] w-full rounded-md border bg-ink px-1.5 font-mono text-[12px] text-foreground outline-none placeholder:text-faint",
      invalid ? "border-danger" : "border-primary/60"
    );

  // Inline "new file / new folder" row, shown inside the folder it targets
  const renderCreateRow = (parent: string, depth: number) => {
    if (!creating || creating.parent !== parent) return null;
    const isFile = creating.kind === "file";
    const Glyph = isFile ? fileGlyph(createValue || "x.txt") : Folder;
    return (
      <div style={{ paddingLeft: rowPad(depth) }} className="py-0.5 pr-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-3 shrink-0" aria-hidden />
          <Glyph size={14} className="shrink-0 text-faint" aria-hidden />
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
            placeholder={isFile ? "File name, e.g. main.py" : "Folder name"}
            aria-label={isFile ? "New file name" : "New folder name"}
            aria-invalid={createError ? true : undefined}
            spellCheck={false}
            autoComplete="off"
            className={inputClass(!!createError)}
          />
        </div>
        {createError ? (
          <p role="alert" className="mt-1 pl-[34px] text-[12px] leading-snug text-danger">
            {createError}
          </p>
        ) : createHint ? (
          <p className="mt-1 truncate pl-[34px] text-[12px] text-faint" title={createHint}>
            {createHint}
          </p>
        ) : null}
      </div>
    );
  };

  const renderRenameInput = () => (
    <div className="min-w-0 flex-1">
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
        onFocus={(e) => {
          // Select the name without its extension, like most editors.
          const v = e.currentTarget.value;
          const dot = v.lastIndexOf(".");
          e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length);
        }}
        autoFocus
        aria-label="New name"
        aria-invalid={renameError ? true : undefined}
        spellCheck={false}
        className={inputClass(!!renameError)}
      />
      {renameError && (
        <p role="alert" className="mt-1 whitespace-normal text-[12px] leading-snug text-danger">
          {renameError}
        </p>
      )}
    </div>
  );

  // Hover / focus revealed actions for a row (always visible on touch screens)
  const rowActions = (children: ReactNode) => (
    <div className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      {children}
    </div>
  );

  // Recursive tree node renderer
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      const isRenaming = renaming?.kind === "folder" && renaming.path === node.path;
      const FolderGlyph = isExpanded ? FolderOpen : Folder;

      return (
        <div key={node.id} role="none">
          <div
            role="treeitem"
            aria-expanded={isExpanded}
            aria-level={depth + 1}
            tabIndex={0}
            onClick={() => !isRenaming && toggleFolder(node.path)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleFolder(node.path);
              } else if (e.key === "ArrowRight" && !isExpanded) {
                e.preventDefault();
                toggleFolder(node.path);
              } else if (e.key === "ArrowLeft" && isExpanded) {
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
            style={{ paddingLeft: rowPad(depth) }}
            className={cn(rowBase, "text-foreground/85 hover:bg-raised hover:text-foreground")}
          >
            <ChevronRight
              size={12}
              aria-hidden
              className={cn(
                "shrink-0 text-faint transition-transform duration-150 motion-reduce:transition-none",
                isExpanded && "rotate-90"
              )}
            />
            <FolderGlyph size={14} aria-hidden className="shrink-0 text-faint" />

            {isRenaming ? (
              renderRenameInput()
            ) : (
              <span
                className="min-w-0 flex-1 truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (onRenameFolder) startRename("folder", node.id, node.path, node.name);
                }}
                title={node.path}
              >
                {node.name}
              </span>
            )}

            {!isRenaming &&
              rowActions(
                <>
                  <IconButton
                    size="sm"
                    label={`New file in ${node.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      startCreate("file", node.path);
                    }}
                  >
                    <Plus size={12} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={`New folder in ${node.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      startCreate("folder", node.path);
                    }}
                  >
                    <FolderPlus size={12} />
                  </IconButton>
                  {onRenameFolder && (
                    <IconButton
                      size="sm"
                      label="Rename"
                      shortcut="F2"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename("folder", node.id, node.path, node.name);
                      }}
                    >
                      <Pencil size={11} />
                    </IconButton>
                  )}
                  {onDeleteFolder && (
                    <IconButton
                      size="sm"
                      tone="danger"
                      label="Delete folder"
                      shortcut="Del"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(node.path);
                      }}
                    >
                      <Trash2 size={11} />
                    </IconButton>
                  )}
                </>
              )}
          </div>

          {isExpanded && (
            <div role="group" className="relative">
              {/* Indent guide, aligned with this folder's chevron */}
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-rule"
                style={{ left: `${depth * INDENT + 13}px` }}
              />
              {renderCreateRow(node.path, depth + 1)}
              {node.children && node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File node
    const file = node.file!;
    const isActive = file.id === activeFileId;
    const isRenaming = renaming?.kind === "file" && renaming.id === file.id;
    const Glyph = fileGlyph(node.name);

    return (
      <div
        key={node.id}
        role="treeitem"
        aria-selected={isActive}
        aria-level={depth + 1}
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
        style={{ paddingLeft: rowPad(depth) }}
        className={cn(
          rowBase,
          isActive
            ? "bg-raised text-foreground"
            : "text-muted-foreground hover:bg-raised/70 hover:text-foreground"
        )}
      >
        {/* Chevron column, kept empty so file names line up with folder names */}
        <span className="w-3 shrink-0" aria-hidden />
        <Glyph size={14} aria-hidden className={cn("shrink-0", isActive ? "text-muted-foreground" : "text-faint")} />

        {isRenaming ? (
          renderRenameInput()
        ) : (
          <span
            className="min-w-0 flex-1 truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onRenameFile) startRename("file", file.id, file.name, node.name);
            }}
            title={file.name}
          >
            {node.name}
          </span>
        )}

        {file.isDirty && !isRenaming && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning group-hover:hidden group-focus-within:hidden"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          />
        )}

        {!isRenaming &&
          rowActions(
            <>
              {onRenameFile && (
                <IconButton
                  size="sm"
                  label="Rename"
                  shortcut="F2"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename("file", file.id, file.name, node.name);
                  }}
                >
                  <Pencil size={11} />
                </IconButton>
              )}
              {onDeleteFile && (
                <IconButton
                  size="sm"
                  tone="danger"
                  label="Delete file"
                  shortcut="Del"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(file.id);
                  }}
                >
                  <Trash2 size={11} />
                </IconButton>
              )}
            </>
          )}
      </div>
    );
  };

  const isWorkspaceEmpty = files.length === 0 && folders.length === 0;

  return (
    <div className="group/sidebar z-10 flex h-full w-60 shrink-0 select-none flex-col border-r border-rule bg-panel">
      {activeTab === "search" ? (
        <div className="flex h-full flex-col">
          <SectionHeader title="Search" />
          <div className="px-3 pb-2">
            <div className="flex h-8 items-center gap-1.5 rounded-md border border-rule bg-ink px-2.5 focus-within:border-primary/60">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in files"
                aria-label="Search in files"
                className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="rounded text-faint hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {searchQuery && searchResults.length > 0 && (
              <p className="mt-2 text-[12px] text-faint">
                {searchResults.reduce((n, r) => n + r.matches.length, 0)} results in {searchResults.length}{" "}
                {searchResults.length === 1 ? "file" : "files"}
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pb-2">
            {files.length === 0 && <p className="px-3 text-[13px] text-muted-foreground">No files to search yet.</p>}
            {searchQuery && files.length > 0 && searchResults.length === 0 && (
              <p className="px-3 text-[13px] text-muted-foreground">No results for "{searchQuery}".</p>
            )}
            {searchResults.map(({ file, matches }) => {
              const Glyph = fileGlyph(file.name);
              return (
                <div key={file.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => onSelectFile(file.id)}
                    className="flex h-[22px] w-full items-center gap-1.5 px-3 text-left text-[13px] text-foreground hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <Glyph size={14} aria-hidden className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="tabular-nums text-[12px] text-faint">{matches.length}</span>
                  </button>
                  {matches.slice(0, 5).map((m, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => onSelectFile(file.id)}
                      className="flex h-[22px] w-full items-center gap-2 pl-8 pr-3 text-left font-mono text-[12px] text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                      title={m.text}
                    >
                      <span className="w-6 shrink-0 text-right tabular-nums text-faint">{m.lineNum}</span>
                      <span className="truncate">{m.text}</span>
                    </button>
                  ))}
                  {matches.length > 5 && (
                    <p className="pl-8 text-[12px] text-faint">{matches.length - 5} more in this file</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === "timeline" ? (
        <div className="flex h-full flex-col">
          <SectionHeader title="Timeline" count={timelineEntries.length} />
          {activeFile && (
            <p className="-mt-1 truncate px-3 pb-2 font-mono text-[12px] text-faint" title={activeFile.name}>
              {activeFile.name}
            </p>
          )}
          <div className="flex-1 overflow-y-auto">
            {timelineEntries.length === 0 ? (
              <p className="px-3 text-[13px] leading-relaxed text-muted-foreground">
                {activeFile
                  ? "No versions yet. A version is saved each time you run or save this file."
                  : "Open a file to see its earlier versions."}
              </p>
            ) : (
              <ul>
                {timelineEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="group flex items-center gap-2 border-b border-rule/60 px-3 py-2 last:border-b-0 hover:bg-raised/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground">{entry.label}</p>
                      <p className="text-[12px] text-faint">
                        {formatRelativeTime(entry.timestamp)}, {entry.lineCount} lines
                      </p>
                    </div>
                    {onRestoreSnapshot && (
                      <button
                        type="button"
                        onClick={() => onRestoreSnapshot(entry.content)}
                        className="h-6 shrink-0 rounded-md border border-rule px-2 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:bg-raised hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <SectionHeader
            title="Explorer"
            actions={
              <>
                <IconButton label="New file" shortcut={shortcutFor("new-file")} side="bottom" onClick={() => startCreate("file", "")}>
                  <FilePlus size={14} />
                </IconButton>
                <IconButton label="New folder" side="bottom" onClick={() => startCreate("folder", "")}>
                  <FolderPlus size={14} />
                </IconButton>
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
                      tabIndex={-1}
                    />
                    <IconButton label="Upload files" side="bottom" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={14} />
                    </IconButton>
                  </>
                )}
                <IconButton label="Collapse folders" side="bottom" onClick={collapseAllFolders}>
                  <ListCollapse size={14} />
                </IconButton>
              </>
            }
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <div role="tree" aria-label="Project files" className="min-h-0 flex-1 overflow-y-auto pb-2">
              {/* Project root */}
              <div
                role="treeitem"
                aria-expanded={rootExpanded}
                aria-level={0}
                tabIndex={0}
                onClick={() => setRootExpanded((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setRootExpanded((prev) => !prev);
                  }
                }}
                className={cn(rowBase, "pl-2 font-semibold text-foreground hover:bg-raised")}
              >
                <ChevronRight
                  size={12}
                  aria-hidden
                  className={cn(
                    "shrink-0 text-faint transition-transform duration-150 motion-reduce:transition-none",
                    rootExpanded && "rotate-90"
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[12px]">{projectName || "zuup-project"}</span>
                {isCloudProject && (
                  <span
                    className="mr-1 text-[12px] font-normal text-faint"
                    title={hasUnsavedChanges ? "Changes not yet saved to the cloud" : "Saved to the cloud"}
                  >
                    {hasUnsavedChanges ? "Unsaved" : "Saved"}
                  </span>
                )}
              </div>

              {rootExpanded && (
                <div role="group" className="relative">
                  {renderCreateRow("", 0)}

                  {isWorkspaceEmpty && !creating && (
                    <div className="px-3 pt-2">
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        This project has no files yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => startCreate("file", "")}
                        className="mt-2 h-7 rounded-md border border-rule px-2.5 text-[13px] text-foreground transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      >
                        New file
                      </button>
                    </div>
                  )}

                  {treeNodes.map((node) => renderTreeNode(node, 0))}
                </div>
              )}
            </div>

            {/* Timeline: earlier versions of the open file */}
            <div className="shrink-0 border-t border-rule">
              <button
                type="button"
                onClick={() => setTimelineOpen((prev) => !prev)}
                aria-expanded={timelineOpen}
                className="flex h-8 w-full items-center gap-1 px-2 text-left text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <ChevronRight
                  size={12}
                  aria-hidden
                  className={cn(
                    "text-faint transition-transform duration-150 motion-reduce:transition-none",
                    timelineOpen && "rotate-90"
                  )}
                />
                Timeline
                {timelineEntries.length > 0 && (
                  <span className="ml-1 font-normal tabular-nums text-faint">{timelineEntries.length}</span>
                )}
              </button>

              {timelineOpen && (
                <div className="max-h-36 overflow-y-auto pb-2">
                  {timelineEntries.length === 0 ? (
                    <p className="px-3 pb-1 text-[12px] text-faint">
                      {activeFile ? "Versions appear here when you run or save." : "Open a file to see its versions."}
                    </p>
                  ) : (
                    timelineEntries.slice(0, 8).map((entry) => (
                      <div
                        key={entry.id}
                        className="group flex h-[22px] items-center gap-2 pl-[22px] pr-1.5 text-[12px] text-muted-foreground hover:bg-raised hover:text-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                        <span className="shrink-0 text-faint group-hover:hidden group-focus-within:hidden">
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                        {onRestoreSnapshot && (
                          <button
                            type="button"
                            onClick={() => onRestoreSnapshot(entry.content)}
                            className="hidden shrink-0 rounded px-1 text-foreground underline-offset-2 hover:underline focus-visible:inline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary group-hover:inline group-focus-within:inline"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-rule px-1.5 py-1">
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex h-7 w-full items-center rounded-md px-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Sentence-case panel header; actions fade in on hover or keyboard focus. */
function SectionHeader({ title, count, actions }: { title: string; count?: number; actions?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between pl-3 pr-1.5">
      <h2 className="text-[12px] font-semibold text-muted-foreground">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-1.5 font-normal tabular-nums text-faint">{count}</span>
        )}
      </h2>
      {actions && (
        <div className="flex items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/sidebar:opacity-100 [@media(hover:none)]:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}

export default Sidebar;
