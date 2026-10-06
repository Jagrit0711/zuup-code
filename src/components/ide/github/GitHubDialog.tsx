import { useState } from "react";
import { AlertTriangle, Download, ExternalLink, Github, Loader2, LogOut, Pause, Play, RefreshCw, Trash2, Unlink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { GitHubSync } from "@/hooks/useGitHubSync";
import GitHubSignIn from "./GitHubSignIn";
import LinkRepoForm from "./LinkRepoForm";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "./styles";
import { TONE_CLASS, describeSyncStatus } from "./syncStatus";

interface GitHubDialogProps {
  sync: GitHubSync;
  projectName: string | null;
  fileCount: number;
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
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
      <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-y-auto rounded-xl border-border bg-transparent p-0 shadow-2xl glass-strong glow-primary">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5 pr-12">
          <Github size={16} className="text-primary" aria-hidden="true" />
          <DialogTitle className="text-sm font-semibold text-foreground">GitHub sync</DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Connect your GitHub account and keep this project in sync with a repository.
        </DialogDescription>

        <div className="space-y-5 p-5">
          <section className="space-y-3" aria-label="Account">
            <SectionTitle>Account</SectionTitle>
            {auth && !tokenRejected ? (
              <div className="flex items-center gap-3">
                {auth.avatar ? (
                  <img src={auth.avatar} alt="" className="h-8 w-8 rounded-full border border-border" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                    <Github size={15} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">@{auth.login ?? "unknown"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {auth.kind === "oauth" ? "Signed in with GitHub" : auth.kind === "fine-grained" ? "Fine-grained token" : "Personal access token"}
                    {auth.scopes.length ? ` · ${auth.scopes.join(", ")}` : ""}
                  </p>
                </div>
                <button type="button" onClick={sync.signOut} className={secondaryButtonClass}>
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            ) : (
              <>
                {tokenRejected && (
                  <p className="flex items-start gap-1.5 text-[11px] text-red-400">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> GitHub rejected your token. Sign in again to resume syncing.
                  </p>
                )}
                <GitHubSignIn />
              </>
            )}
          </section>

          {auth && (
            <section className="space-y-3 border-t border-border pt-4" aria-label="Repository">
              <SectionTitle>{projectName ? `Repository for "${projectName}"` : "Repository for this workspace"}</SectionTitle>
              {link ? (
                <div className="space-y-3">
                  <div className="rounded border border-border/60 bg-secondary/20 px-3 py-2.5">
                    <p className="truncate text-xs font-medium text-foreground">
                      {link.owner}/{link.repo}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Branch {link.branch}
                      {link.subdir ? ` · folder ${link.subdir}` : ""}
                    </p>
                    <p className={`mt-1 text-[11px] ${TONE_CLASS[status.tone]}`}>{status.detail}</p>
                    {state?.skipped.length ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {state.skipped.length} file{state.skipped.length === 1 ? " is" : "s are"} not synced (binary, too large or ignored).
                      </p>
                    ) : null}
                  </div>

                  {heldDeletes ? (
                    <div className="space-y-2 rounded border border-yellow-500/30 bg-yellow-500/5 p-3">
                      <p className="flex items-start gap-1.5 text-xs font-medium text-yellow-500/90">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        This would delete {heldDeletes.paths.length} file{heldDeletes.paths.length === 1 ? "" : "s"} on GitHub
                      </p>
                      <p className="text-[11px] text-muted-foreground">
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
                          {busy === "delete" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete them on GitHub
                        </button>
                        <button type="button" onClick={() => void run("restore")} disabled={!!busy} className={primaryButtonClass}>
                          {busy === "restore" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Restore from GitHub
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {state && state.conflicts.length > 0 && (
                        <button type="button" onClick={() => sync.setConflictsOpen(true)} className={secondaryButtonClass}>
                          <AlertTriangle size={13} className="text-red-400" /> Resolve conflicts
                        </button>
                      )}
                      <button type="button" onClick={() => void sync.syncNow()} disabled={!sync.controller} className={secondaryButtonClass}>
                        <RefreshCw size={13} /> Sync now
                      </button>
                      <button type="button" onClick={sync.togglePause} disabled={!sync.controller} className={secondaryButtonClass}>
                        {state?.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                        {state?.status === "paused" ? "Resume" : "Pause"}
                      </button>
                      <button type="button" onClick={sync.openOnGitHub} className={secondaryButtonClass}>
                        <ExternalLink size={13} /> Open on GitHub
                      </button>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="button" onClick={sync.unlink} className={dangerButtonClass}>
                      <Unlink size={13} /> Unlink
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
