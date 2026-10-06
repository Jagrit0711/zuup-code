import { useEffect, useRef, type KeyboardEvent, type WheelEvent } from "react";
import { X } from "lucide-react";
import { FileTab } from "@/lib/fileSystem";

interface FileTabsProps {
  /** Only the files that have an open tab. Closing a tab never deletes the file. */
  files: FileTab[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
}

const baseName = (path: string) => path.split("/").pop() || path;

const FileTabs = ({ files, activeFileId, onSelectFile, onCloseFile }: FileTabsProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());

  // Keep the active tab visible when many tabs overflow the bar.
  useEffect(() => {
    tabRefs.current.get(activeFileId)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeFileId, files.length]);

  // A vertical mouse wheel scrolls the tab strip sideways.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  const focusTab = (index: number) => {
    const file = files[(index + files.length) % files.length];
    if (!file) return;
    onSelectFile(file.id);
    tabRefs.current.get(file.id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number, id: string) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        onSelectFile(id);
        break;
      case "ArrowRight":
        e.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(files.length - 1);
        break;
      case "Delete":
        e.preventDefault();
        onCloseFile(id);
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Open files"
      onWheel={onWheel}
      className="no-scrollbar flex h-9 w-full min-w-0 shrink-0 select-none items-stretch overflow-x-auto overflow-y-hidden bg-panel"
    >
      {files.map((file, index) => {
        const isActive = file.id === activeFileId;
        const name = baseName(file.name);

        return (
          <div
            key={file.id}
            ref={(el) => {
              if (el) tabRefs.current.set(file.id, el);
              else tabRefs.current.delete(file.id);
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={file.isDirty ? `${file.name} (unsaved)` : file.name}
            onClick={() => onSelectFile(file.id)}
            onMouseDown={(e) => {
              // Stop the browser's middle-click autoscroll.
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onCloseFile(file.id);
              }
            }}
            onKeyDown={(e) => onKeyDown(e, index, file.id)}
            className={`group relative flex shrink-0 cursor-pointer items-center gap-1 border-r border-rule pl-3 pr-1.5 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary ${
              isActive
                ? "border-b border-b-transparent bg-ink text-foreground"
                : "border-b border-b-rule text-muted-foreground hover:bg-ink/50 hover:text-foreground"
            }`}
          >
            {isActive && <span className="absolute inset-x-0 top-0 h-[2px] bg-primary" aria-hidden="true" />}
            <span className="max-w-[180px] truncate">{name}</span>

            {/* Dirty dot that becomes the close button on hover or focus. */}
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Close ${name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(file.id);
              }}
              className={`relative ml-1 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground focus-visible:outline-none ${
                file.isDirty || isActive ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              }`}
            >
              {file.isDirty ? (
                <>
                  <span
                    className="h-2 w-2 rounded-full bg-foreground/70 group-hover:hidden group-focus-visible:hidden"
                    aria-hidden="true"
                  />
                  <X size={13} className="hidden group-hover:block group-focus-visible:block" aria-hidden="true" />
                </>
              ) : (
                <X size={13} aria-hidden="true" />
              )}
            </button>
          </div>
        );
      })}
      {/* Remaining strip keeps the bottom hairline under the tabs. */}
      <div className="min-w-4 flex-1 border-b border-rule" aria-hidden="true" />
    </div>
  );
};

export default FileTabs;
