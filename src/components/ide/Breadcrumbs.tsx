import { getBreadcrumbSegments } from "@/lib/folderTree";

interface BreadcrumbsProps {
  activeFilePath?: string;
  projectName?: string | null;
  /** Kept for compatibility; run state now shows on the Run button and in the status bar. */
  isRunning?: boolean;
  onNavigateFolder?: (folderPath: string) => void;
}

const crumb =
  "rounded-sm px-0.5 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

/** Path of the active file, one hairline below the tabs. Folders open the Explorer. */
const Breadcrumbs = ({ activeFilePath = "", projectName = "zuup-project", onNavigateFolder }: BreadcrumbsProps) => {
  const segments = getBreadcrumbSegments(activeFilePath, projectName || "zuup-project");

  return (
    <nav
      aria-label="File path"
      className="z-10 flex h-6 w-full min-w-0 shrink-0 select-none items-center overflow-hidden bg-ink px-3 font-mono text-[12px] text-muted-foreground"
    >
      <ol className="no-scrollbar flex min-w-0 items-center overflow-x-auto whitespace-nowrap">
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <li key={seg.path || seg.label} className="flex shrink-0 items-center">
              {idx > 0 && (
                <span className="px-1 text-faint" aria-hidden="true">
                  /
                </span>
              )}
              {isLast && !seg.isFolder && !seg.isRoot ? (
                <span className="text-foreground" aria-current="page">
                  {seg.label}
                </span>
              ) : onNavigateFolder ? (
                <button
                  type="button"
                  onClick={() => onNavigateFolder(seg.isRoot ? "" : seg.path)}
                  className={crumb}
                  title={seg.isRoot ? "Show the project in the Explorer" : `Show ${seg.path} in the Explorer`}
                >
                  {seg.label}
                </button>
              ) : (
                <span className="px-0.5">{seg.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
