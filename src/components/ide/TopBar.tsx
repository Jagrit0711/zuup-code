import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Download, Keyboard, Loader2, MoreHorizontal, Play, Share2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { LanguageConfig } from "@/lib/languages";
import type { Profile } from "@/lib/profile";
import LanguagePicker from "@/components/ide/LanguagePicker";
import Hint from "@/components/ide/chrome/Hint";
import IconButton from "@/components/ide/chrome/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortcutFor } from "@/components/ide/palette/shortcuts";

interface TopBarProps {
  activeLanguage: LanguageConfig;
  activeFileName: string;
  /** False when no file is open: file actions are disabled and the language picker sets the default for new files. */
  hasActiveFile?: boolean;
  projectName?: string | null;
  onRun: () => void;
  /** Stops the current run. When given, the Run button becomes "Stop" while a program runs. */
  onStop?: () => void;
  onSave: () => void;
  onDownload: () => void;
  onShare: () => void;
  onNewFile: () => void;
  onNewProject: () => void;
  onLanguageChange: (id: string) => void;
  /** Renames the open project. When given, clicking the project name edits it in place. */
  onRenameProject?: (name: string) => void;
  isRunning: boolean;
  user?: User | null;
  profile?: Profile | null;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  isCloudProject?: boolean;
  onToggleShortcuts?: () => void;
}

const quietText =
  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary data-[state=open]:bg-raised data-[state=open]:text-foreground";

const menuItem = "flex items-center justify-between gap-6 rounded-md px-2 py-1.5 text-[13px]";

/** Project name, editable in place when a rename handler exists. */
const ProjectName = ({ name, onRename }: { name: string | null; onRename?: (name: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!name && !onRename) return null;
  const shown = name || "Untitled project";

  if (editing && onRename) {
    const commit = () => {
      const next = draft.trim();
      setEditing(false);
      if (next && next !== name) onRename(next);
    };
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(name ?? "");
            setEditing(false);
          }
        }}
        aria-label="Project name"
        maxLength={80}
        className="h-7 w-48 rounded-md border border-primary/60 bg-ink px-2 text-[13px] text-foreground outline-none"
      />
    );
  }

  if (!onRename) {
    return (
      <span className="max-w-[200px] truncate px-2 text-[13px] text-foreground" title={shown}>
        {shown}
      </span>
    );
  }

  return (
    <Hint label="Rename project">
      <button
        type="button"
        onClick={() => {
          setDraft(name ?? "");
          setEditing(true);
        }}
        className={`${quietText} max-w-[220px] text-foreground`}
      >
        <span className="truncate">{shown}</span>
      </button>
    </Hint>
  );
};

const TopBar = ({
  activeLanguage,
  hasActiveFile = true,
  projectName,
  onRun,
  onStop,
  onSave,
  onDownload,
  onShare,
  onNewFile,
  onNewProject,
  onLanguageChange,
  onRenameProject,
  isRunning,
  user,
  profile,
  isSaving,
  hasUnsavedChanges,
  isCloudProject,
  onToggleShortcuts,
}: TopBarProps) => {
  const displayName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "";
  const canStop = isRunning && !!onStop;

  const saveLabel = isSaving ? "Saving" : hasUnsavedChanges ? "Save" : "Saved";
  const saveHint = user && isCloudProject ? "Save to your account" : "Save in this browser";

  return (
    <header className="z-20 flex h-11 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-rule bg-panel pl-2 pr-2 sm:gap-3 sm:pl-3">
      {/* Left: wordmark, project, new, language */}
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <Link
          to={user ? "/dashboard" : "/"}
          className="mr-1 flex shrink-0 items-center gap-2 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={user ? "Zuup Code dashboard" : "Zuup Code home"}
        >
          <img
            src="https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png"
            alt=""
            className="h-5 w-5 rounded-sm"
          />
          <span className="hidden font-display text-[15px] font-bold tracking-[-0.02em] text-foreground sm:inline">
            Zuup Code
          </span>
        </Link>

        {(projectName || onRenameProject) && (
          <>
            <span className="hidden text-[13px] text-faint md:inline" aria-hidden="true">
              /
            </span>
            <div className="hidden md:block">
              <ProjectName name={projectName ?? null} onRename={onRenameProject} />
            </div>
          </>
        )}

        <span className="mx-1.5 hidden h-4 w-px bg-rule sm:block" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger className={`${quietText} hidden shrink-0 sm:inline-flex`}>
            New
            <ChevronDown size={12} className="text-faint" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="z-[110] w-60 rounded-lg border-rule bg-raised p-1 shadow-float"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => onNewFile()} className={menuItem}>
              New file
              <span className="font-mono text-[11px] text-faint">{shortcutFor("new-file")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewProject()} className={menuItem}>
              New project
              <span className="font-mono text-[11px] text-faint">{shortcutFor("new-project")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <LanguagePicker
          value={activeLanguage}
          onChange={onLanguageChange}
          title={hasActiveFile ? "Language of the active file" : "Language for new files"}
        />
      </div>

      {/* Right: save state, quiet tools, account, Run */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {/* Below sm the secondary actions collapse into one menu. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More actions" className="sm:hidden">
              <MoreHorizontal size={16} strokeWidth={1.75} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="z-[110] w-56 rounded-lg border-rule bg-raised p-1 shadow-float"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => onNewFile()} className={menuItem}>
              New file
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewProject()} className={menuItem}>
              New project
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-rule" />
            <DropdownMenuItem onSelect={() => onSave()} disabled={isSaving || !hasUnsavedChanges} className={menuItem}>
              {hasUnsavedChanges || isSaving ? saveLabel : "Saved"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownload()} disabled={!hasActiveFile} className={menuItem}>
              Download file
            </DropdownMenuItem>
            {onToggleShortcuts && (
              <DropdownMenuItem onSelect={() => onToggleShortcuts()} className={menuItem}>
                Keyboard shortcuts
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Hint label={saveHint} shortcut="Ctrl+S">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            aria-label={saveLabel}
            className={`${quietText} hidden disabled:pointer-events-none sm:inline-flex ${
              hasUnsavedChanges || isSaving ? "" : "text-faint"
            }`}
          >
            {saveLabel}
          </button>
        </Hint>

        <span className="mx-1 hidden h-4 w-px bg-rule sm:block" aria-hidden="true" />

        <IconButton label="Download file" shortcut="Ctrl+Shift+S" onClick={onDownload} disabled={!hasActiveFile} className="hidden sm:inline-flex">
          <Download size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Share" onClick={onShare} disabled={!hasActiveFile}>
          <Share2 size={15} strokeWidth={1.75} />
        </IconButton>
        {onToggleShortcuts && (
          <IconButton label="Keyboard shortcuts" shortcut="Ctrl+/" onClick={onToggleShortcuts} className="hidden sm:inline-flex">
            <Keyboard size={15} strokeWidth={1.75} />
          </IconButton>
        )}

        <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />

        {user ? (
          <Hint label={displayName ? `${displayName}, open dashboard` : "Open dashboard"}>
            <Link
              to="/dashboard"
              aria-label="Open dashboard"
              className="flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-muted-foreground">
                  {(displayName || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          </Hint>
        ) : (
          <Link to="/login?redirect=/editor" className={quietText}>
            Sign in
          </Link>
        )}

        <Hint label={canStop ? "Stop the program" : isRunning ? "Running" : "Run the active file"} shortcut={canStop ? undefined : "Ctrl+Enter"}>
          <button
            type="button"
            onClick={() => (canStop ? onStop?.() : onRun())}
            disabled={!hasActiveFile || (isRunning && !canStop)}
            aria-busy={isRunning}
            className="ml-1.5 inline-flex h-8 min-w-[72px] items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:pointer-events-none disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Play size={12} fill="currentColor" aria-hidden="true" />
            )}
            {canStop ? (
              "Stop"
            ) : isRunning ? (
              "Running"
            ) : (
              "Run"
            )}
          </button>
        </Hint>
      </div>
    </header>
  );
};

export default TopBar;
