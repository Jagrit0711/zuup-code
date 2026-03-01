import { ChevronRight, File, FolderOpen, Plus, Settings, FileCode } from "lucide-react";
import { languages } from "@/lib/languages";
import { FileTab } from "@/lib/fileSystem";

interface SidebarProps {
  files: FileTab[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onNewFile: () => void;
  onOpenSettings: () => void;
}

const Sidebar = ({ files, activeFileId, onSelectFile, onNewFile, onOpenSettings }: SidebarProps) => {
  return (
    <div className="flex h-full w-52 flex-col glass-strong border-r border-border shrink-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Explorer
        </span>
        <button
          onClick={onNewFile}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="New File"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1">
          <div className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <FolderOpen size={13} className="text-primary" />
            <span>zuup-project</span>
          </div>
        </div>

        <div className="ml-2 space-y-0.5">
          {files.map((file) => (
            <button
              key={file.id}
              onClick={() => onSelectFile(file.id)}
              className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-[11px] font-mono transition-all ${
                file.id === activeFileId
                  ? "bg-primary/10 text-primary glow-primary-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <FileCode size={11} />
              <span className="truncate">{file.name}</span>
              {file.isDirty && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
              {file.id === activeFileId && (
                <ChevronRight size={10} className="ml-auto shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

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
  );
};

export default Sidebar;
