import { ChevronRight, Folder, FolderOpen, GitBranch } from "lucide-react";
import { getBreadcrumbSegments, getFileIconInfo } from "@/lib/folderTree";

interface BreadcrumbsProps {
  activeFilePath?: string;
  projectName?: string | null;
  isRunning?: boolean;
  onNavigateFolder?: (folderPath: string) => void;
}

const Breadcrumbs = ({
  activeFilePath = "",
  projectName = "zuup-project",
  isRunning = false,
  onNavigateFolder,
}: BreadcrumbsProps) => {
  const segments = getBreadcrumbSegments(activeFilePath, projectName || "zuup-project");
  const fileIconInfo = getFileIconInfo(activeFilePath);

  return (
    <div className="flex h-7 w-full items-center justify-between border-b border-white/[0.06] bg-[#0c0f1a]/80 backdrop-blur-md px-3 select-none text-[11px] font-mono shrink-0 z-10">
      {/* ─── Breadcrumb trail ─── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0">
        {/* Git branch chip */}
        <div className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/70 bg-white/[0.04] border border-white/[0.05] shrink-0">
          <GitBranch size={10} className="text-primary/70" />
          <span>main</span>
        </div>

        <div className="h-3 w-px bg-white/[0.08] mx-0.5 shrink-0" />

        {/* Breadcrumb Path Segments */}
        <div className="flex items-center gap-1 truncate">
          {segments.map((seg, idx) => {
            return (
              <div key={seg.path || seg.label} className="flex items-center gap-1 shrink-0">
                {idx > 0 && (
                  <ChevronRight size={10} className="text-muted-foreground/40 shrink-0" />
                )}

                {seg.isRoot ? (
                  <button
                    onClick={() => onNavigateFolder && onNavigateFolder("")}
                    className="flex items-center gap-1 text-foreground/80 hover:text-foreground font-semibold transition-colors"
                    title={`Project Root: ${seg.label}`}
                  >
                    <Folder size={11} className="text-amber-400" />
                    <span className="truncate">{seg.label}</span>
                  </button>
                ) : seg.isFolder ? (
                  <button
                    onClick={() => onNavigateFolder && onNavigateFolder(seg.path)}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    title={`Folder: ${seg.path}`}
                  >
                    <FolderOpen size={11} className="text-amber-400/80" />
                    <span className="truncate">{seg.label}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-foreground font-medium">
                    <span className={`text-[10px] font-bold ${fileIconInfo.badgeColor}`}>
                      {fileIconInfo.symbol}
                    </span>
                    <span className="truncate">{seg.label}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Right: Subtle status indicator ─── */}
      <div className="flex items-center gap-2 shrink-0 pl-2">
        {isRunning && (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Running...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Breadcrumbs;
