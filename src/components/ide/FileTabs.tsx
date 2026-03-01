import { X, FileCode } from "lucide-react";
import { FileTab } from "@/lib/fileSystem";

interface FileTabsProps {
  files: FileTab[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
}

const FileTabs = ({ files, activeFileId, onSelectFile, onCloseFile }: FileTabsProps) => {
  return (
    <div className="flex h-9 items-center gap-0 overflow-x-auto border-b border-border bg-secondary/30">
      {files.map((file) => {
        const isActive = file.id === activeFileId;
        return (
          <button
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            className={`group flex h-full items-center gap-1.5 border-r border-border px-3 text-xs font-mono transition-colors shrink-0 ${
              isActive
                ? "bg-editor text-foreground border-b-2 border-b-primary"
                : "bg-secondary/20 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            }`}
          >
            <FileCode size={12} className={isActive ? "text-primary" : ""} />
            <span>{file.name}</span>
            {file.isDirty && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
            {files.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file.id);
                }}
                className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
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
