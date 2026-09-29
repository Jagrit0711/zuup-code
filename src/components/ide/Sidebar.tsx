import {
  ChevronRight,
  ChevronDown,
  FileCode,
  FolderOpen,
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
} from "lucide-react";
import { languages, detectLanguageFromFilename, getLanguageById } from "@/lib/languages";
import { FileTab } from "@/lib/fileSystem";
import { getFileTimeline, formatRelativeTime, type TimelineEntry } from "@/lib/timelineStorage";
import { useRef, useState, useEffect } from "react";

export type SidebarTab = "explorer" | "search" | "timeline";

interface SidebarProps {
  files: FileTab[];
  activeFileId: string;
  projectName?: string | null;
  isCloudProject?: boolean;
  hasUnsavedChanges?: boolean;
  activeTab?: SidebarTab;
  onSelectFile: (id: string) => void;
  onCreateFile: (name: string, languageId: string) => void;
  onDeleteFile?: (id: string) => void;
  onRenameFile?: (id: string, newName: string) => void;
  onOpenSettings: () => void;
  onUploadFiles?: (files: { name: string; content: string }[]) => void;
  onRestoreSnapshot?: (content: string) => void;
  inlineCreateTrigger?: number; // Prop to trigger inline creation from hotkeys / external buttons
}

const Sidebar = ({
  files,
  activeFileId,
  projectName,
  isCloudProject,
  hasUnsavedChanges,
  activeTab = "explorer",
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onOpenSettings,
  onUploadFiles,
  onRestoreSnapshot,
  inlineCreateTrigger,
}: SidebarProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Inline file creation state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [inlineFileName, setInlineFileName] = useState("");

  // Inline rename state
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Timeline accordion open/closed
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Trigger inline creation from external props (e.g. TopBar or keyboard shortcuts)
  useEffect(() => {
    if (inlineCreateTrigger) {
      setIsCreatingFile(true);
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

  // Detected language for the inline input as user types
  const detectedLang = inlineFileName.includes(".")
    ? detectLanguageFromFilename(inlineFileName)
    : null;

  const handleStartCreate = () => {
    setIsCreatingFile(true);
    setInlineFileName("");
    setTimeout(() => inlineInputRef.current?.focus(), 50);
  };

  const handleCommitCreate = () => {
    const raw = inlineFileName.trim();
    if (!raw) {
      setIsCreatingFile(false);
      return;
    }
    // Auto-detect language
    const lang = detectLanguageFromFilename(raw);
    const finalName = raw.includes(".") ? raw : `${raw}${lang.extension}`;
    onCreateFile(finalName, lang.id);
    setIsCreatingFile(false);
    setInlineFileName("");
  };

  const handleCancelCreate = () => {
    setIsCreatingFile(false);
    setInlineFileName("");
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelCreate();
    }
  };

  // Inline Rename
  const handleStartRename = (file: FileTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingFileId(file.id);
    setRenameValue(file.name);
  };

  const handleCommitRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && onRenameFile) {
      onRenameFile(id, trimmed);
    }
    setRenamingFileId(null);
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

  // Active file info
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

  return (
    <div className="flex h-full w-56 flex-col glass-strong border-r border-border shrink-0 select-none">
      {/* ─── Search Tab View ─── */}
      {activeTab === "search" ? (
        <div className="flex flex-col h-full">
          <div className="border-b border-border px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Search size={12} className="text-primary" />
              Search
            </span>
          </div>
          <div className="p-2.5">
            <div className="flex items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1 ring-1 ring-border/50 focus-within:ring-primary/60">
              <Search size={12} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across files..."
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
              <div key={file.id} className="rounded-md border border-border/30 bg-secondary/20 p-2 space-y-1">
                <button
                  onClick={() => onSelectFile(file.id)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary transition-colors w-full text-left"
                >
                  <FileCode size={12} className="text-primary shrink-0" />
                  <span className="truncate flex-1 font-mono">{file.name}</span>
                  <span className="text-[9px] text-muted-foreground rounded bg-secondary px-1">{matches.length}</span>
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
        /* ─── Dedicated Timeline Tab View ─── */
        <div className="flex flex-col h-full">
          <div className="border-b border-border px-3 py-2.5 flex items-center justify-between">
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
                  className="rounded-lg border border-border/40 bg-secondary/20 p-2.5 hover:bg-secondary/40 transition-all space-y-1.5 group"
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
        /* ─── Explorer Tab View (Default VS Code Tree) ─── */
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Explorer
            </span>
            <div className="flex items-center gap-1">
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
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Upload Files"
                  >
                    <Upload size={13} />
                  </button>
                </>
              )}
              {/* VS Code-style Inline New File Button */}
              <button
                onClick={handleStartCreate}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="New File (inline)"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col justify-between">
            <div>
              {/* Project Folder Label */}
              <div className="mb-1.5">
                <div className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  <FolderOpen size={13} className="text-primary shrink-0" />
                  <span className="truncate flex-1 font-semibold text-foreground/80">
                    {projectName || "zuup-project"}
                  </span>
                  {isCloudProject && (
                    <span title={hasUnsavedChanges ? "Unsaved changes" : "Saved to cloud"}>
                      {hasUnsavedChanges ? (
                        <CloudOff size={11} className="text-yellow-500/70" />
                      ) : (
                        <Cloud size={11} className="text-green-500/70" />
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* File List */}
              <div className="ml-1 space-y-0.5">
                {/* ── VS Code Inline File Creation Row ── */}
                {isCreatingFile && (
                  <div className="mb-1.5 flex flex-col gap-1 rounded-md bg-secondary/80 p-1.5 ring-1 ring-primary/70 glow-primary-sm">
                    <div className="flex items-center gap-1.5">
                      <FileCode size={13} className="text-primary shrink-0" />
                      <input
                        ref={inlineInputRef}
                        type="text"
                        value={inlineFileName}
                        onChange={(e) => setInlineFileName(e.target.value)}
                        onKeyDown={handleInlineKeyDown}
                        placeholder="filename.ext (e.g. main.c)"
                        className="w-full bg-transparent text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/60"
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground px-0.5">
                      <span className="flex items-center gap-1">
                        {detectedLang ? (
                          <span className="text-primary font-medium">Type: {detectedLang.label}</span>
                        ) : (
                          <span>Press Enter to save</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleCommitCreate}
                          className="hover:text-green-400 p-0.5"
                          title="Create"
                        >
                          <Check size={11} />
                        </button>
                        <button
                          onClick={handleCancelCreate}
                          className="hover:text-destructive p-0.5"
                          title="Cancel (Esc)"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Existing Files */}
                {files.map((file) => {
                  const isRenaming = renamingFileId === file.id;
                  const isActive = file.id === activeFileId;

                  return (
                    <div
                      key={file.id}
                      onClick={() => !isRenaming && onSelectFile(file.id)}
                      className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-mono transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary/15 text-primary glow-primary-sm font-semibold"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      }`}
                    >
                      <FileCode size={12} className={isActive ? "text-primary shrink-0" : "text-muted-foreground shrink-0"} />

                      {isRenaming ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitRename(file.id);
                            if (e.key === "Escape") setRenamingFileId(null);
                          }}
                          onBlur={() => handleCommitRename(file.id)}
                          autoFocus
                          className="flex-1 bg-secondary rounded px-1 py-0.5 text-[11px] text-foreground outline-none ring-1 ring-primary"
                        />
                      ) : (
                        <span
                          className="truncate flex-1"
                          onDoubleClick={(e) => handleStartRename(file, e)}
                          title={`${file.name} (Double-click to rename)`}
                        >
                          {file.name}
                        </span>
                      )}

                      {/* Dirty indicator */}
                      {file.isDirty && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
                      )}

                      {/* File actions on hover */}
                      {!isRenaming && (
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-auto">
                          {onRenameFile && (
                            <button
                              onClick={(e) => handleStartRename(file, e)}
                              className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
                              title="Rename file (F2 / double click)"
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
                              className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete file"
                            >
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      )}

                      {isActive && !file.isDirty && !isRenaming && (
                        <ChevronRight size={10} className="ml-auto shrink-0 group-hover:hidden" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─── VS Code Timeline Accordion (at bottom of Explorer) ─── */}
            <div className="mt-4 border-t border-border/40 pt-2">
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
                  <span className="rounded bg-secondary/80 px-1 text-[9px] text-muted-foreground font-mono">
                    {timelineEntries.length}
                  </span>
                )}
              </button>

              {timelineOpen && (
                <div className="mt-1 space-y-1 max-h-40 overflow-y-auto pl-1 pr-1">
                  {timelineEntries.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/50 py-2 text-center">
                      No history snapshots yet
                    </p>
                  ) : (
                    timelineEntries.slice(0, 8).map((entry) => (
                      <div
                        key={entry.id}
                        className="group flex items-center justify-between rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary/40 hover:text-foreground transition-colors"
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

          {/* Footer Settings */}
          <div className="border-t border-border p-2">
            <button
              onClick={onOpenSettings}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
