import {
  Play, Save, Download, Share2, Plus, ChevronDown, FileCode, FolderPlus,
  Keyboard, Check, Loader2,
} from "lucide-react";
import type { LanguageConfig } from "@/lib/languages";
import LanguagePicker from "@/components/ide/LanguagePicker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";

interface TopBarProps {
  activeLanguage: LanguageConfig;
  activeFileName: string;
  /** False when no file is open: file actions are disabled and the language picker sets the default for new files. */
  hasActiveFile?: boolean;
  projectName?: string | null;
  onRun: () => void;
  onSave: () => void;
  onDownload: () => void;
  onShare: () => void;
  onNewFile: () => void;
  onNewProject: () => void;
  onLanguageChange: (id: string) => void;
  isRunning: boolean;
  user?: User | null;
  profile?: Profile | null;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  isCloudProject?: boolean;
  onToggleShortcuts?: () => void;
}

const TopBar = ({
  activeLanguage,
  activeFileName,
  hasActiveFile = true,
  projectName,
  onRun,
  onSave,
  onDownload,
  onShare,
  onNewFile,
  onNewProject,
  onLanguageChange,
  isRunning,
  user,
  profile,
  isSaving,
  hasUnsavedChanges,
  isCloudProject,
  onToggleShortcuts,
}: TopBarProps) => {
  const [saveFlash, setSaveFlash] = useState(false);

  // Flash animation on successful save
  useEffect(() => {
    if (isSaving === false && saveFlash) {
      const t = setTimeout(() => setSaveFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [isSaving, saveFlash]);

  const handleSave = () => {
    setSaveFlash(true);
    onSave();
  };

  // Save button state
  const saveLabel = isSaving
    ? "Saving..."
    : hasUnsavedChanges
      ? "Save"
      : "Saved";

  const saveIcon = isSaving ? (
    <Loader2 size={13} className="animate-spin" />
  ) : !hasUnsavedChanges ? (
    <Check size={13} className="text-green-400" />
  ) : (
    <Save size={13} />
  );

  const displayName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "";

  return (
    <div className="flex h-11 items-center justify-between border-b border-white/[0.08] liquid-glass px-3 shrink-0 z-20">
      {/* ─── Left: Logo + Project + New ─── */}
      <div className="flex items-center gap-2">
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-1.5 group" title="Home">
          <img
            src="https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png"
            alt="Zuup"
            className="h-6 w-6 rounded group-hover:scale-110 transition-transform"
          />
          <div className="hidden sm:flex items-center gap-0.5">
            <span className="text-sm font-bold text-foreground">Zuup</span>
            <span className="text-sm font-light text-primary">Code</span>
          </div>
        </Link>

        {projectName && (
          <>
            <span className="hidden md:inline text-muted-foreground/30 text-xs">/</span>
            <div className="hidden md:flex items-center gap-1.5 max-w-[180px]">
              <span className="text-xs text-muted-foreground truncate" title={projectName}>
                {projectName}
              </span>
              {isCloudProject && (
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasUnsavedChanges ? "bg-yellow-400" : "bg-green-400"}`}
                  title={hasUnsavedChanges ? "Unsaved changes" : "Saved to cloud"} />
              )}
            </div>
          </>
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {/* New menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-all hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary data-[state=open]:bg-secondary data-[state=open]:text-foreground"
              title="New file or project"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">New</span>
              <ChevronDown size={10} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56 z-[110] p-1"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => onNewFile()} className="gap-3 px-2.5 py-2 text-[11px]">
              <div className="h-7 w-7 rounded-lg bg-secondary/80 flex items-center justify-center">
                <FileCode size={13} className="text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium">New File</div>
                <div className="text-[10px] text-muted-foreground">Empty file (Ctrl+N)</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewProject()} className="gap-3 px-2.5 py-2 text-[11px]">
              <div className="h-7 w-7 rounded-lg bg-secondary/80 flex items-center justify-center">
                <FolderPlus size={13} className="text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium">New Project</div>
                <div className="text-[10px] text-muted-foreground">Blank, named (Ctrl+Shift+N)</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-4 w-px bg-border/50" />

        {/* Language selector */}
        <LanguagePicker
          value={activeLanguage}
          onChange={onLanguageChange}
          title={hasActiveFile ? "Language of the active file" : "Language for new files"}
        />
      </div>

      {/* ─── Center: File indicator ─── */}
      <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
        {activeFileName && (
          <>
            <FileCode size={11} />
            <span className="font-mono">{activeFileName}</span>
          </>
        )}
      </div>

      {/* ─── Right: Actions ─── */}
      <div className="flex items-center gap-0.5">
        {/* Smart Save - single button for both local & cloud */}
        <button
          onClick={handleSave}
          disabled={isSaving || !hasUnsavedChanges}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-all ${
            isSaving
              ? "text-primary/60 cursor-wait"
              : !hasUnsavedChanges
                ? "text-green-400/70 cursor-default"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          } ${saveFlash && !hasUnsavedChanges ? "animate-pulse" : ""}`}
          title={user && isCloudProject ? "Save to cloud (Ctrl+S)" : "Save (Ctrl+S)"}
        >
          {saveIcon}
          <span className="hidden sm:inline">{saveLabel}</span>
        </button>

        <button
          onClick={onDownload}
          disabled={!hasActiveFile}
          className="hidden sm:flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
          title="Download (Ctrl+Shift+S)"
          aria-label="Download file"
        >
          <Download size={13} />
        </button>

        <button
          onClick={onShare}
          disabled={!hasActiveFile}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
          title="Share"
          aria-label="Share"
        >
          <Share2 size={13} />
        </button>

        {onToggleShortcuts && (
          <button
            onClick={onToggleShortcuts}
            className="hidden sm:flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            title="Keyboard Shortcuts (Ctrl+/)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={13} />
          </button>
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {/* User area */}
        {user ? (
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-all hover:bg-secondary group"
            title="Dashboard"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-border/50 group-hover:ring-primary/50 transition-all" />
            ) : (
              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary ring-1 ring-border/50">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="hidden lg:inline text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
              {displayName}
            </span>
          </Link>
        ) : (
          <Link
            to="/login?redirect=/editor"
            className="flex items-center gap-1 rounded-md px-3 py-1 text-[11px] text-primary hover:bg-primary/10 transition-all font-medium"
          >
            Sign In with Zuup
          </Link>
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        {/* Run button */}
        <button
          onClick={() => onRun()}
          disabled={isRunning || !hasActiveFile}
          title="Run (Ctrl+Enter)"
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-40 disabled:pointer-events-none ${
            isRunning
              ? "bg-primary/30 text-primary/60 cursor-wait"
              : "bg-primary text-primary-foreground hover:brightness-110 glow-primary-sm hover:glow-primary"
          }`}
        >
          {isRunning ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Play size={11} fill="currentColor" />
          )}
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>
    </div>
  );
};

export default TopBar;
