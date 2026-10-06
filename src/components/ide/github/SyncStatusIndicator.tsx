import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GitHubSync } from "@/hooks/useGitHubSync";
import { menuItemClass, menuSurfaceClass } from "./styles";
import { TONE_CLASS, describeSyncStatus } from "./syncStatus";

interface SyncStatusIndicatorProps {
  sync: GitHubSync;
}

const trigger =
  "inline-flex h-full items-center gap-1.5 transition-colors duration-150 hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary";
const danger = `${menuItemClass} text-danger focus:text-danger`;

/** Status bar entry: repository, branch and live sync state, with the common actions one click away. */
const SyncStatusIndicator = ({ sync }: SyncStatusIndicatorProps) => {
  const { link, state } = sync;

  if (!link) {
    return (
      <button
        type="button"
        onClick={() => sync.setDialogOpen(true)}
        className={trigger}
        title="Sync this project with a GitHub repository"
      >
        Connect GitHub
      </button>
    );
  }

  const view = describeSyncStatus(sync.auth ? state : null);
  const signedOut = !sync.auth;
  const label = signedOut ? "Sign in" : view.label;
  const tone = signedOut ? TONE_CLASS.error : TONE_CLASS[view.tone];
  const status = state?.status;
  const conflicts = state?.conflicts.length ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={trigger}
        title={`${link.owner}/${link.repo} (${link.branch}): ${signedOut ? "Signed out of GitHub" : view.detail}`}
        aria-label={`GitHub sync: ${label}`}
      >
        <span className="hidden max-w-[180px] truncate sm:inline">
          {link.repo}
          <span className="text-faint"> on {link.branch}</span>
        </span>
        <span className={tone}>
          {label}
          {view.spinning && !signedOut ? "…" : ""}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className={`w-64 ${menuSurfaceClass}`}>
        <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {link.owner}/{link.repo}
          </div>
          <div className="truncate font-mono text-[11px] font-normal text-muted-foreground">
            {link.branch}
            {link.subdir ? ` / ${link.subdir}` : ""}
          </div>
          <div className={`text-[12px] font-normal ${tone}`}>{signedOut ? "Signed out of GitHub" : view.detail}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-rule" />
        {signedOut || status === "unauthenticated" ? (
          <DropdownMenuItem className={menuItemClass} onSelect={() => sync.setDialogOpen(true)}>
            Sign in to GitHub
          </DropdownMenuItem>
        ) : null}
        {status === "held" && (
          <>
            <DropdownMenuItem className={menuItemClass} onSelect={() => void sync.restoreDeleted()}>
              Restore from GitHub
            </DropdownMenuItem>
            <DropdownMenuItem className={danger} onSelect={() => sync.setDialogOpen(true)}>
              Review deletion…
            </DropdownMenuItem>
          </>
        )}
        {conflicts > 0 && (
          <DropdownMenuItem className={menuItemClass} onSelect={() => sync.setConflictsOpen(true)}>
            Resolve {conflicts} conflict{conflicts === 1 ? "" : "s"}
          </DropdownMenuItem>
        )}
        {sync.controller && (
          <>
            <DropdownMenuItem
              className={menuItemClass}
              onSelect={() => void sync.syncNow()}
              disabled={status === "pushing" || status === "pulling"}
            >
              Sync now
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemClass} onSelect={sync.togglePause}>
              {status === "paused" ? "Resume sync" : "Pause sync"}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className={menuItemClass} onSelect={sync.openOnGitHub}>
          Open on GitHub
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClass} onSelect={() => sync.setDialogOpen(true)}>
          GitHub settings…
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-rule" />
        <DropdownMenuItem className={danger} onSelect={sync.unlink}>
          Unlink repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SyncStatusIndicator;
