import { Play, Save, Download, Share2, Plus, ChevronDown, FileCode, FolderPlus, Cloud, LayoutDashboard, LogOut } from "lucide-react";
import { LanguageConfig, languages } from "@/lib/languages";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";

interface TopBarProps {
  activeLanguage: LanguageConfig;
  activeFileName: string;
  projectName?: string | null;
  onRun: () => void;
  onSave: () => void;
  onDownload: () => void;
  onShare: () => void;
  onNewFile: () => void;
  onNewProject: () => void;
  onLanguageChange: (id: string) => void;
  onCloudSave?: () => void;
  isRunning: boolean;
  user?: User | null;
  profile?: Profile | null;
  isSaving?: boolean;
}

const TopBar = ({
  activeLanguage,
  activeFileName,
  projectName,
  onRun,
  onSave,
  onDownload,
  onShare,
  onNewFile,
  onNewProject,
  onLanguageChange,
  onCloudSave,
  isRunning,
  user,
  profile,
  isSaving,
}: TopBarProps) => {
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  return (
    <>
      <div className="flex h-11 items-center justify-between border-b border-border glass-strong px-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png" alt="Zuup" className="h-6 w-6 rounded" />
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-foreground">Zuup</span>
            <span className="text-sm font-light text-primary">Code</span>
            {projectName && (
              <>
                <span className="text-muted-foreground/40 mx-1">/</span>
                <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={projectName}>
                  {projectName}
                </span>
              </>
            )}
          </div>
          
          <div className="relative ml-2">
            <button
              onClick={() => setNewDropdownOpen(!newDropdownOpen)}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="New File or Project"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">New</span>
              <ChevronDown size={11} />
            </button>
          </div>
          
          <div className="mx-2 h-4 w-px bg-border" />
          <select
            value={activeLanguage.id}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="rounded bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground outline-none ring-1 ring-border transition-colors hover:ring-primary focus:ring-primary cursor-pointer"
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.id} className="bg-popover">
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-0.5">

          <button
            onClick={onSave}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Save"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={onDownload}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Download"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Download</span>
          </button>

          <button
            onClick={onShare}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Share"
          >
            <Share2 size={13} />
            <span className="hidden sm:inline">Share</span>
          </button>

          {user && onCloudSave && (
            <button
              onClick={onCloudSave}
              disabled={isSaving}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Save to Cloud"
            >
              <Cloud size={13} className={isSaving ? 'animate-pulse' : ''} />
              <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Cloud'}</span>
            </button>
          )}

          <div className="mx-1 h-4 w-px bg-border" />

          {user ? (
            <Link
              to="/dashboard"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Dashboard"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <LayoutDashboard size={13} />
              )}
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/10"
            >
              Sign In
            </Link>
          )}

          <div className="mx-1 h-4 w-px bg-border" />

          <button
            onClick={onRun}
            disabled={isRunning}
            className={`flex items-center gap-1.5 rounded px-4 py-1.5 text-[11px] font-semibold transition-all ${
              isRunning
                ? "bg-primary/30 text-primary/60 cursor-wait"
                : "bg-primary text-primary-foreground hover:brightness-110 glow-primary-sm hover:glow-primary"
            }`}
          >
            <Play size={11} fill="currentColor" />
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>
      </div>
      
      {/* Dropdown portal to avoid clipping */}
      {newDropdownOpen && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setNewDropdownOpen(false)} />
          <div className="fixed top-12 left-[140px] w-48 rounded-lg bg-popover border border-border shadow-xl z-[101]">
            <button
              onClick={() => {
                onNewFile();
                setNewDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-t-lg"
            >
              <FileCode size={14} />
              <div className="text-left">
                <div className="font-medium">New File</div>
                <div className="text-[10px] text-muted-foreground">Create a single file</div>
              </div>
            </button>
            <button
              onClick={() => {
                onNewProject();
                setNewDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-b-lg"
            >
              <FolderPlus size={14} />
              <div className="text-left">
                <div className="font-medium">New Project</div>
                <div className="text-[10px] text-muted-foreground">Create from template</div>
              </div>
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default TopBar;
