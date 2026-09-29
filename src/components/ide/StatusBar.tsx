import { GitBranch, Cloud, CloudOff, Loader2, CheckCircle2, Cpu } from "lucide-react";

interface StatusBarProps {
  cursorPosition: { line: number; col: number };
  tabSize: number;
  languageLabel: string;
  isCloudProject: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onLanguageClick?: () => void;
}

const StatusBar = ({
  cursorPosition,
  tabSize,
  languageLabel,
  isCloudProject,
  isSaving,
  hasUnsavedChanges,
  onLanguageClick,
}: StatusBarProps) => {
  return (
    <footer className="flex h-6 w-full items-center justify-between border-t border-white/[0.08] liquid-glass px-3 text-[11px] text-muted-foreground select-none shrink-0 font-mono z-20">
      {/* ─── Left Section ─── */}
      <div className="flex items-center gap-3">
        {/* Branch */}
        <div className="flex items-center gap-1 hover:text-foreground transition-colors cursor-default" title="Git Branch: main">
          <GitBranch size={11} className="text-primary/80" />
          <span>main</span>
        </div>

        {/* Sync Status */}
        <div className="flex items-center gap-1 hover:text-foreground transition-colors cursor-default">
          {isSaving ? (
            <>
              <Loader2 size={11} className="animate-spin text-primary" />
              <span className="text-primary">Saving...</span>
            </>
          ) : isCloudProject ? (
            hasUnsavedChanges ? (
              <>
                <CloudOff size={11} className="text-yellow-500/80" />
                <span className="text-yellow-500/80">Unsaved</span>
              </>
            ) : (
              <>
                <Cloud size={11} className="text-green-400/80" />
                <span>Cloud Synced</span>
              </>
            )
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400/80" />
              <span>Local Session</span>
            </>
          )}
        </div>

        {/* Problems count */}
        <div className="hidden sm:flex items-center gap-1 text-muted-foreground/60 hover:text-foreground cursor-default">
          <CheckCircle2 size={11} className="text-green-500/70" />
          <span>0 errors, 0 warnings</span>
        </div>
      </div>

      {/* ─── Right Section ─── */}
      <div className="flex items-center gap-3">
        {/* Ln / Col */}
        <div className="hover:text-foreground transition-colors cursor-default">
          Ln {cursorPosition.line}, Col {cursorPosition.col}
        </div>

        {/* Spaces */}
        <div className="hidden sm:inline hover:text-foreground transition-colors cursor-default">
          Spaces: {tabSize}
        </div>

        {/* Encoding */}
        <div className="hidden md:inline hover:text-foreground transition-colors cursor-default">
          UTF-8
        </div>

        {/* Language selector trigger */}
        <button
          onClick={onLanguageClick}
          className="hover:text-primary transition-colors cursor-pointer font-medium text-foreground/80 hover:underline"
          title="Select Language Mode"
        >
          {languageLabel}
        </button>

        {/* Runtime engine indicator */}
        <div className="hidden lg:flex items-center gap-1 text-muted-foreground/80 hover:text-foreground cursor-default" title="Execution Engine: Piston v3">
          <Cpu size={11} className="text-primary/80" />
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Piston Runtime
          </span>
        </div>
      </div>
    </footer>
  );
};

export default StatusBar;
