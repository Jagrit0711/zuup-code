import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { FileTab } from "@/lib/fileSystem";
import { getFileIconInfo } from "@/lib/folderTree";

interface FileTabsProps {
  /** Only the files that have an open tab. Closing a tab never deletes the file. */
  files: FileTab[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
}

const FileTabs = ({ files, activeFileId, onSelectFile, onCloseFile }: FileTabsProps) => {
  const activeRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when many tabs overflow the bar.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeFileId, files.length]);

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex h-9 items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-[#090c14]/80 backdrop-blur-xl px-1.5 select-none no-scrollbar shrink-0"
    >
      {files.map((file) => {
        const isActive = file.id === activeFileId;
        const iconInfo = getFileIconInfo(file.name);
        const displayName = file.name.split("/").pop() || file.name;

        return (
          <div
            key={file.id}
            ref={isActive ? activeRef : undefined}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={file.name}
            onClick={() => onSelectFile(file.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onCloseFile(file.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectFile(file.id);
              }
            }}
            className={`group relative flex h-7 items-center gap-1.5 rounded-md pl-2.5 pr-1 text-xs font-mono transition-all shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
              isActive
                ? "bg-white/[0.08] text-foreground font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] border border-white/[0.1]"
                : "text-muted-foreground/75 hover:bg-white/[0.04] hover:text-foreground border border-transparent"
            }`}
          >
            {/* Language / Framework Badge / Icon */}
            <span className={`text-[10px] font-bold ${iconInfo.badgeColor} shrink-0`}>{iconInfo.symbol}</span>

            {/* Display File Name */}
            <span className="truncate max-w-[130px]">{displayName}</span>

            {/* Dirty Unsaved Dot */}
            {file.isDirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Unsaved changes" />
            )}

            {/* Active Pill Glow Line */}
            {isActive && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />}

            {/* Close tab (the file stays in the Explorer) */}
            <button
              type="button"
              tabIndex={isActive ? 0 : -1}
              aria-label={`Close ${displayName}`}
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(file.id);
              }}
              className={`ml-0.5 rounded p-0.5 transition-all hover:bg-white/[0.1] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                isActive ? "opacity-70" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default FileTabs;
