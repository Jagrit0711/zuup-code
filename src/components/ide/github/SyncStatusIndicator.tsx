import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  ExternalLink,
  Github,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GitHubSync } from "@/hooks/useGitHubSync";
import { TONE_CLASS, describeSyncStatus } from "./syncStatus";

interface SyncStatusIndicatorProps {
  sync: GitHubSync;
}

/** Status bar entry: repository, branch and live sync state, with the common actions one click away. */
const SyncStatusIndicator = ({ sync }: SyncStatusIndicatorProps) => {
  const { link, state } = sync;

  if (!link) {
    return (
      <button
        type="button"
        onClick={() => sync.setDialogOpen(true)}
        className="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
        title="Sync this project with a GitHub repository"
      >
        <Github size={11} className="text-primary/80" />
        <span>Connect GitHub</span>
      </button>
    );
  }

  const view = describeSyncStatus(sync.auth ? state : null);
  const signedOut = !sync.auth;
  const label = signedOut ? "Sign in" : view.label;
  const tone = signedOut ? TONE_CLASS.error : TONE_CLASS[view.tone];
  const status = state?.status;
  const Icon = view.spinning
    ? Loader2
    : status === "synced"
      ? CheckCircle2
      : status === "offline"
        ? CloudOff
        : status === "conflict" || status === "error" || status === "unauthenticated" || status === "held" || signedOut
          ? AlertTriangle
          : RefreshCw;
  const conflicts = state?.conflicts.length ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        title={`${link.owner}/${link.repo} (${link.branch}) - ${signedOut ? "Signed out of GitHub" : view.detail}`}
        aria-label={`GitHub sync: ${label}`}
      >
        <Github size={11} className="text-primary/80" />
        <span className="hidden max-w-[160px] truncate sm:inline">
          {link.repo}
          <span className="text-muted-foreground/60">@{link.branch}</span>
        </span>
        <span className={`flex items-center gap-1 ${tone}`}>
          <Icon size={11} className={view.spinning ? "animate-spin" : undefined} />
          <span>{label}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64 text-xs">
        <DropdownMenuLabel className="space-y-0.5">
          <div className="truncate text-xs font-semibold">
            {link.owner}/{link.repo}
          </div>
          <div className="truncate text-[11px] font-normal text-muted-foreground">
            {link.branch}
            {link.subdir ? ` / ${link.subdir}` : ""}
          </div>
          <div className={`text-[11px] font-normal ${tone}`}>{signedOut ? "Signed out of GitHub" : view.detail}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {signedOut || status === "unauthenticated" ? (
          <DropdownMenuItem onSelect={() => sync.setDialogOpen(true)}>
            <Github size={13} className="mr-2" /> Sign in to GitHub
          </DropdownMenuItem>
        ) : null}
        {status === "held" && (
          <>
            <DropdownMenuItem onSelect={() => void sync.restoreDeleted()}>
              <Download size={13} className="mr-2" /> Restore from GitHub
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => sync.setDialogOpen(true)} className="text-red-400 focus:text-red-400">
              <Trash2 size={13} className="mr-2" /> Review deletion…
            </DropdownMenuItem>
          </>
        )}
        {conflicts > 0 && (
          <DropdownMenuItem onSelect={() => sync.setConflictsOpen(true)}>
            <AlertTriangle size={13} className="mr-2 text-red-400" /> Resolve {conflicts} conflict{conflicts === 1 ? "" : "s"}
          </DropdownMenuItem>
        )}
        {sync.controller && (
          <>
            <DropdownMenuItem onSelect={() => void sync.syncNow()} disabled={status === "pushing" || status === "pulling"}>
              <RefreshCw size={13} className="mr-2" /> Sync now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={sync.togglePause}>
              {status === "paused" ? <Play size={13} className="mr-2" /> : <Pause size={13} className="mr-2" />}
              {status === "paused" ? "Resume sync" : "Pause sync"}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={sync.openOnGitHub}>
          <ExternalLink size={13} className="mr-2" /> Open on GitHub
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => sync.setDialogOpen(true)}>
          <Settings2 size={13} className="mr-2" /> GitHub settings…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={sync.unlink} className="text-red-400 focus:text-red-400">
          <Unlink size={13} className="mr-2" /> Unlink repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SyncStatusIndicator;
