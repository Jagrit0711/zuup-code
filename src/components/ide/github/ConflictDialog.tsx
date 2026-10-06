import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { AlertTriangle, Check, Cloud, FileText, Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Conflict, ConflictKind } from "@/lib/github";
import { loadMonaco } from "@/lib/editor/loadMonaco";
import { ZUUP_THEME } from "@/lib/editor/theme";
import { detectLanguageFromFilename } from "@/lib/languages";
import type { GitHubSync } from "@/hooks/useGitHubSync";
import { primaryButtonClass, secondaryButtonClass } from "./styles";

interface ConflictDialogProps {
  sync: GitHubSync;
}

const KIND_LABEL: Record<ConflictKind, string> = {
  "modify-modify": "Changed in both places",
  "add-add": "Created in both places",
  "modify-delete": "You changed it, GitHub deleted it",
  "delete-modify": "You deleted it, GitHub changed it",
};

const DIFF_OPTIONS = {
  readOnly: true,
  originalEditable: false,
  renderSideBySide: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 12,
  automaticLayout: true,
} as const;

/** Fallback when Monaco cannot load: two plain panes. */
const PlainSide = ({ title, content }: { title: string; content: string | null }) => (
  <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border first:border-r">
    <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">{title}</div>
    <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground">
      {content ?? <span className="italic text-muted-foreground">(deleted)</span>}
    </pre>
  </div>
);

/** Lists open conflicts and lets the user keep their version or take GitHub's, one file at a time. */
const ConflictDialog = ({ sync }: ConflictDialogProps) => {
  const conflicts: Conflict[] = sync.state?.conflicts ?? [];
  const open = sync.conflictsOpen;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [monaco, setMonaco] = useState<"loading" | "ready" | "failed">("loading");

  const selected = conflicts.find((c) => c.path === selectedPath) ?? conflicts[0] ?? null;
  const { setConflictsOpen } = sync;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadMonaco().then(
      () => alive && setMonaco("ready"),
      () => alive && setMonaco("failed"),
    );
    return () => {
      alive = false;
    };
  }, [open]);

  // Close once everything is resolved.
  useEffect(() => {
    if (open && conflicts.length === 0) setConflictsOpen(false);
  }, [open, conflicts.length, setConflictsOpen]);

  const resolve = (choice: "local" | "remote") => {
    if (!selected) return;
    const ok = sync.resolveConflict(selected.path, choice);
    if (!ok) return;
    toast.success(choice === "local" ? `Keeping your ${selected.path}` : `Took GitHub's ${selected.path}`, {
      description: choice === "local" ? "It will be pushed to GitHub." : undefined,
    });
    setSelectedPath(null);
  };

  const language = selected ? detectLanguageFromFilename(selected.path).monacoId : "plaintext";

  return (
    <Dialog open={open} onOpenChange={setConflictsOpen}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-0 overflow-hidden rounded-xl border-border bg-transparent p-0 shadow-2xl glass-strong glow-primary">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5 pr-12">
          <AlertTriangle size={16} className="text-red-400" aria-hidden="true" />
          <DialogTitle className="text-sm font-semibold text-foreground">
            Resolve sync conflicts ({conflicts.length})
          </DialogTitle>
        </div>
        <DialogDescription className="border-b border-border px-5 py-2 text-[11px] text-muted-foreground">
          These files changed both here and on GitHub. Your version stays in the editor until you choose.
        </DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <ul className="max-h-40 shrink-0 overflow-y-auto border-b border-border sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r" aria-label="Conflicting files">
            {conflicts.map((c) => (
              <li key={c.path}>
                <button
                  type="button"
                  onClick={() => setSelectedPath(c.path)}
                  aria-current={selected?.path === c.path}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/40 ${
                    selected?.path === c.path ? "bg-primary/10" : ""
                  }`}
                >
                  <FileText size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-foreground">{c.path}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{KIND_LABEL[c.kind]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selected && (
              <>
                <div className="flex shrink-0 text-[11px] text-muted-foreground">
                  <span className="flex flex-1 items-center gap-1.5 border-b border-r border-border px-3 py-1.5">
                    <Cloud size={12} /> GitHub {selected.remote === null && "(deleted)"}
                  </span>
                  <span className="flex flex-1 items-center gap-1.5 border-b border-border px-3 py-1.5">
                    <Monitor size={12} /> Yours {selected.local === null && "(deleted)"}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  {monaco === "ready" ? (
                    <DiffEditor
                      key={selected.path}
                      height="100%"
                      language={language}
                      original={selected.remote ?? ""}
                      modified={selected.local ?? ""}
                      theme={ZUUP_THEME}
                      options={DIFF_OPTIONS}
                      loading={<Loader2 size={16} className="animate-spin text-muted-foreground" />}
                    />
                  ) : monaco === "failed" ? (
                    <div className="flex h-full">
                      <PlainSide title="GitHub" content={selected.remote} />
                      <PlainSide title="Yours" content={selected.local} />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
                  <button type="button" onClick={() => resolve("remote")} className={secondaryButtonClass}>
                    <Cloud size={13} /> {selected.remote === null ? "Delete it (take theirs)" : "Take theirs"}
                  </button>
                  <button type="button" onClick={() => resolve("local")} className={primaryButtonClass}>
                    <Check size={13} /> {selected.local === null ? "Keep it deleted (mine)" : "Keep mine"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConflictDialog;
