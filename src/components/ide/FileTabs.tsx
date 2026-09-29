import { X } from "lucide-react";
import { FileTab } from "@/lib/fileSystem";
import { getFileIconInfo } from "@/lib/folderTree";

interface FileTabsProps {
  files: FileTab[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
}

const FileTabs = ({ files, activeFileId, onSelectFile, onCloseFile }: FileTabsProps) => {
  return (
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-[#090c14]/80 backdrop-blur-xl px-1.5 select-none no-scrollbar shrink-0">
      {files.map((file) => {
        const isActive = file.id === activeFileId;
        const iconInfo = getFileIconInfo(file.name);
        const displayName = file.name.split("/").pop() || file.name;

        return (
          <button
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            title={file.name}
            className={`group relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-mono transition-all shrink-0 cursor-pointer ${
              isActive
                ? "bg-white/[0.08] text-foreground font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] border border-white/[0.1]"
                : "text-muted-foreground/75 hover:bg-white/[0.04] hover:text-foreground border border-transparent"
            }`}
          >
            {/* Language / Framework Badge / Icon */}
            <span className={`text-[10px] font-bold ${iconInfo.badgeColor} shrink-0`}>
              {iconInfo.symbol}
            </span>

            {/* Display File Name */}
            <span className="truncate max-w-[130px]">{displayName}</span>

            {/* Dirty Unsaved Dot */}
            {file.isDirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 animate-pulse" title="Unsaved changes" />
            )}

            {/* Active Pill Glow Line */}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
            )}

            {/* Close File Button */}
            {files.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file.id);
                }}
                className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/[0.1] hover:text-destructive transition-all"
                title="Close"
              >
                <X size={10} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default FileTabs;
