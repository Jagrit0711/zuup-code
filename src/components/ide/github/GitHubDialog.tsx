import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { GitHubSync } from "@/hooks/useGitHubSync";
import GitHubSignIn from "./GitHubSignIn";
import LinkRepoForm from "./LinkRepoForm";
import { dangerButtonClass, dialogSurfaceClass, dialogTitleClass, primaryButtonClass, secondaryButtonClass } from "./styles";
import { TONE_CLASS, describeSyncStatus } from "./syncStatus";

interface GitHubDialogProps {
  sync: GitHubSync;
  projectName: string | null;
  fileCount: number;
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[12px] font-semibold text-muted-foreground">{children}</h3>
);

/** Sign in, link the open project to a repository, and manage that link. */
const GitHubDialog = ({ sync, projectName, fileCount }: GitHubDialogProps) => {
  const { auth, link, state } = sync;
  const [busy, setBusy] = useState<"restore" | "delete" | null>(null);
  const status = describeSyncStatus(state);
  const tokenRejected = state?.status === "unauthenticated";
  const heldDeletes = state?.status === "held" ? state.heldDeletes : null;

  const run = async (kind: "restore" | "delete") => {
    if (busy) return;
    setBusy(kind);
    try {
      await (kind === "restore" ? sync.restoreDeleted() : sync.confirmDeletes());
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={sync.dialogOpen} onOpenChange={sync.setDialogOpen}>
      <DialogContent className={`max-h-[90vh] max-w-lg overflow-y-auto ${dialogSurfaceClass}`}>
        <div className="space-y-1 border-b border-rule px-5 pb-4 pt-5 pr-12">
          <DialogTitle className={dialogTitleClass}>GitHub sync</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            Keep this project in step with a GitHub repository. Edits are committed as you.
          </DialogDescription>
        </div>

        <div className="space-y-5 p-5">
          <section className="space-y-3" aria-label="Account">
            <SectionTitle>Account</SectionTitle>
            {auth && !tokenRejected ? (
              <div className="flex items-center gap-3">
                {auth.avatar ? (
                  <img src={auth.avatar} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-muted-foreground">
                    {(auth.login ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">@{auth.login ?? "unknown"}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {auth.kind === "oauth" ? "Signed in with GitHub" : auth.kind === "fine-grained" ? "Fine-grained token" : "Personal access token"}
                    {auth.scopes.length ? `, ${auth.scopes.join(", ")}` : ""}
                  </p>
                </div>
                <button type="button" onClick={sync.signOut} className={secondaryButtonClass}>
                  Sign out
                </button>
              </div>
            ) : (
              <>
                {tokenRejected && (
                  <p className="text-[13px] text-danger" role="alert">
                    GitHub rejected your token. Sign in again to resume syncing.
                  </p>
                )}
                <GitHubSignIn />
              </>
            )}
          </section>

          {auth && (
            <section className="space-y-3 border-t border-rule pt-5" aria-label="Repository">
              <SectionTitle>{projectName ? `Repository for "${projectName}"` : "Repository for this workspace"}</SectionTitle>
              {link ? (
                <div className="space-y-3">
                  <div className="border-l-2 border-rule pl-3">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {link.owner}/{link.repo}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      Branch <span className="font-mono text-[11px]">{link.branch}</span>
                      {link.subdir ? <>, folder <span className="font-mono text-[11px]">{link.subdir}</span></> : null}
                    </p>
                    <p className={`mt-1 text-[12px] ${TONE_CLASS[status.tone]}`}>{status.detail}</p>
                    {state?.skipped.length ? (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {state.skipped.length} file{state.skipped.length === 1 ? " is" : "s are"} not synced (binary, too large or ignored).
                      </p>
                    ) : null}
                  </div>

                  {heldDeletes ? (
                    <div className="space-y-2 border-l-2 border-warning pl-3">
                      <p className="text-[13px] font-medium text-warning">
                        This would delete {heldDeletes.paths.length} file{heldDeletes.paths.length === 1 ? "" : "s"} on GitHub
                      </p>
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        {heldDeletes.paths.length} of the {heldDeletes.baseCount} synced files are missing from this project. If that is
                        not on purpose (for example the project did not load completely), restore them. Nothing is pushed until you choose.
                      </p>
                      <ul className="max-h-28 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                        {heldDeletes.paths.slice(0, 50).map((p) => (
                          <li key={p} className="truncate">
                            {p}
                          </li>
                        ))}
                        {heldDeletes.paths.length > 50 && <li>…and {heldDeletes.paths.length - 50} more</li>}
                      </ul>
                      <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button type="button" onClick={() => void run("delete")} disabled={!!busy} className={dangerButtonClass}>
                          {busy === "delete" && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />} Delete them on GitHub
                        </button>
                        <button type="button" onClick={() => void run("restore")} disabled={!!busy} className={primaryButtonClass}>
                          {busy === "restore" && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />} Restore from GitHub
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {state && state.conflicts.length > 0 && (
                        <button type="button" onClick={() => sync.setConflictsOpen(true)} className={secondaryButtonClass}>
                          Resolve conflicts
                        </button>
                      )}
                      <button type="button" onClick={() => void sync.syncNow()} disabled={!sync.controller} className={secondaryButtonClass}>
                        Sync now
                      </button>
                      <button type="button" onClick={sync.togglePause} disabled={!sync.controller} className={secondaryButtonClass}>
                        {state?.status === "paused" ? "Resume" : "Pause"}
                      </button>
                      <button type="button" onClick={sync.openOnGitHub} className={secondaryButtonClass}>
                        Open on GitHub
                      </button>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="button" onClick={sync.unlink} className={dangerButtonClass}>
                      Unlink repository
                    </button>
                  </div>
                </div>
              ) : (
                <LinkRepoForm sync={sync} fileCount={fileCount} onLinked={() => sync.setDialogOpen(false)} />
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GitHubDialog;
