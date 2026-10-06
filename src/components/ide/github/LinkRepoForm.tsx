import { useEffect, useId, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, GitBranch, Globe, Loader2, Lock, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type BranchSummary, type ImportProgress, type RepoSummary, canWriteRepo, normalizeSubdir } from "@/lib/github";
import type { GitHubSync, RepoTarget } from "@/hooks/useGitHubSync";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./styles";

interface LinkRepoFormProps {
  sync: GitHubSync;
  /** Number of files in the open project (import replaces them). */
  fileCount: number;
  onLinked: () => void;
}

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER_REPO = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Pick (or create) a repository, branch and sub-folder, then import it or push the project to it. */
const LinkRepoForm = ({ sync, fileCount, onLinked }: LinkRepoFormProps) => {
  const uid = useId();
  const { client, auth } = sync;
  const [mode, setMode] = useState<"pick" | "create">("pick");

  // Repository search
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RepoSummary | null>(null);

  // Target details
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branch, setBranch] = useState("");
  const [subdir, setSubdir] = useState("");

  // New repository
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Import
  const [confirmImport, setConfirmImport] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [working, setWorking] = useState(false);

  // Debounced repository search (the newest 100 repos you can access, filtered by name).
  useEffect(() => {
    if (!client || selected) return;
    let alive = true;
    const timer = setTimeout(() => {
      setLoadingRepos(true);
      setRepoError(null);
      client
        .listRepos({ query, perPage: 100 })
        .then(({ repos: found }) => alive && setRepos(found))
        .catch((err) => alive && setRepoError(errorMessage(err, "Could not load your repositories.")))
        .finally(() => alive && setLoadingRepos(false));
    }, query ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client, query, selected]);

  // Branches of the chosen repository; defaults to its default branch.
  useEffect(() => {
    if (!client || !selected) return;
    let alive = true;
    setLoadingBranches(true);
    setBranches([]);
    setBranch(selected.defaultBranch);
    client
      .listBranches(selected.owner, selected.name)
      .then((list) => alive && setBranches(list))
      .catch(() => alive && setBranches([]))
      .finally(() => alive && setLoadingBranches(false));
    return () => {
      alive = false;
    };
  }, [client, selected]);

  const lookupExact = async () => {
    const m = OWNER_REPO.exec(query.trim());
    if (!client || !m) return;
    setLoadingRepos(true);
    try {
      setSelected(await client.getRepo(m[1], m[2]));
    } catch (err) {
      setRepoError(errorMessage(err, "Repository not found."));
    } finally {
      setLoadingRepos(false);
    }
  };

  const createRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || creating || !REPO_NAME.test(newName)) return;
    setCreating(true);
    try {
      const repo = await client.createRepo({ name: newName, private: newPrivate, description: newDescription || undefined });
      toast.success(`Created ${repo.fullName}`);
      setSelected(repo);
      setMode("pick");
    } catch (err) {
      toast.error("Could not create the repository", { description: errorMessage(err, "GitHub refused the request.") });
    } finally {
      setCreating(false);
    }
  };

  const normalizedSubdir = normalizeSubdir(subdir);
  const target: RepoTarget | null =
    selected && branch && normalizedSubdir !== null
      ? { owner: selected.owner, repo: selected.name, branch, subdir: normalizedSubdir }
      : null;

  const runImport = async () => {
    if (!target || working) return;
    setConfirmImport(false);
    setWorking(true);
    setProgress({ phase: "tree", done: 0, total: 1 });
    try {
      const result = await sync.importIntoProject(target, setProgress);
      if (!result) return;
      const skipped = result.skipped.length;
      toast.success(`Imported ${result.files.length} file${result.files.length === 1 ? "" : "s"} from ${target.owner}/${target.repo}`, {
        description: skipped ? `${skipped} binary, large or ignored file${skipped === 1 ? " was" : "s were"} left out.` : undefined,
      });
      onLinked();
    } catch (err) {
      toast.error("Import failed", { description: errorMessage(err, "Could not download the repository.") });
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  const runPush = () => {
    if (!target) return;
    sync.linkForPush(target);
    toast.success(`Linked to ${target.owner}/${target.repo}`, {
      description: "Pushing your files now. Files that differ from the repository will be shown as conflicts.",
    });
    onLinked();
  };

  const writeWarning =
    selected && auth
      ? selected.canPush === false
        ? "You don't have write access to this repository. Import works, but pushes will fail."
        : !canWriteRepo(auth, selected.private)
          ? "Your sign-in only covers public repositories. Sign in again with private repository access to push here."
          : null
      : null;

  if (mode === "create") {
    return (
      <form onSubmit={createRepo} className="space-y-3">
        <button type="button" onClick={() => setMode("pick")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Back to your repositories
        </button>
        <div className="space-y-1">
          <label htmlFor={`${uid}-name`} className="text-xs font-medium text-foreground">
            Repository name
          </label>
          <input id={`${uid}-name`} value={newName} onChange={(e) => setNewName(e.target.value.trim())} placeholder="my-project" className={inputClass} autoFocus />
          {newName && !REPO_NAME.test(newName) && <p className="text-[11px] text-red-400">Use letters, numbers, ".", "-" or "_".</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-desc`} className="text-xs font-medium text-foreground">
            Description <span className="text-muted-foreground">(optional)</span>
          </label>
          <input id={`${uid}-desc`} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={inputClass} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${uid}-private`} className="text-xs text-foreground">
            Private repository
          </label>
          <Switch id={`${uid}-private`} checked={newPrivate} onCheckedChange={setNewPrivate} className="h-5 w-9" />
        </div>
        {auth && newPrivate && !canWriteRepo(auth, true) && (
          <p className="flex items-start gap-1.5 text-[11px] text-yellow-500/90">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Your sign-in only covers public repositories, so syncing a private one will fail.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">The repository starts with a README on its default branch.</p>
        <div className="flex justify-end">
          <button type="submit" disabled={!REPO_NAME.test(newName) || creating} className={primaryButtonClass}>
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create repository
          </button>
        </div>
      </form>
    );
  }

  if (!selected) {
    const exact = OWNER_REPO.test(query.trim()) && !repos.some((r) => r.fullName.toLowerCase() === query.trim().toLowerCase());
    return (
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your repositories or type owner/name"
            aria-label="Search repositories"
            className={`${inputClass} pl-7`}
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto rounded border border-border/60" role="listbox" aria-label="Repositories">
          {loadingRepos && repos.length === 0 ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Loading repositories…
            </div>
          ) : repoError ? (
            <p className="p-3 text-xs text-red-400">{repoError}</p>
          ) : repos.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No repositories match.</p>
          ) : (
            repos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => setSelected(repo)}
                className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left last:border-b-0 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
              >
                {repo.private ? <Lock size={12} className="shrink-0 text-yellow-500/80" /> : <Globe size={12} className="shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">{repo.fullName}</span>
                  {repo.description && <span className="block truncate text-[11px] text-muted-foreground">{repo.description}</span>}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          {exact ? (
            <button type="button" onClick={() => void lookupExact()} className={secondaryButtonClass}>
              Use {query.trim()}
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={() => setMode("create")} className={secondaryButtonClass}>
            <Plus size={13} /> New repository
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setSelected(null)}
        disabled={working}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <ArrowLeft size={12} /> Choose another repository
      </button>
      <div className="flex items-center gap-2 rounded border border-border/60 bg-secondary/20 px-3 py-2">
        {selected.private ? <Lock size={13} className="text-yellow-500/80" /> : <Globe size={13} className="text-muted-foreground" />}
        <span className="truncate text-xs font-medium text-foreground">{selected.fullName}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span id={`${uid}-branch`} className="flex items-center gap-1 text-xs font-medium text-foreground">
            <GitBranch size={12} /> Branch
          </span>
          <Select value={branch} onValueChange={setBranch} disabled={working}>
            <SelectTrigger aria-labelledby={`${uid}-branch`} className="h-8 text-xs">
              <SelectValue placeholder={loadingBranches ? "Loading…" : "Branch"} />
            </SelectTrigger>
            <SelectContent>
              {(branches.length ? branches.map((b) => b.name) : [selected.defaultBranch]).map((name) => (
                <SelectItem key={name} value={name} className="text-xs">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-subdir`} className="text-xs font-medium text-foreground">
            Sub-folder <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id={`${uid}-subdir`}
            value={subdir}
            onChange={(e) => setSubdir(e.target.value)}
            placeholder="repository root"
            disabled={working}
            className={inputClass}
          />
        </div>
      </div>
      {normalizedSubdir === null && <p className="text-[11px] text-red-400">That sub-folder path is not valid.</p>}
      {writeWarning && (
        <p className="flex items-start gap-1.5 text-[11px] text-yellow-500/90">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {writeWarning}
        </p>
      )}

      {progress ? (
        <div className="space-y-1.5" aria-live="polite">
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            {progress.phase === "tree" ? "Reading the repository…" : `Downloading files ${progress.done}/${progress.total}`}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!target || working}
            onClick={() => (fileCount > 0 ? setConfirmImport(true) : void runImport())}
            className={`${secondaryButtonClass} h-auto flex-col items-start gap-0.5 py-2 text-left`}
          >
            <span className="flex items-center gap-1.5">
              <Download size={13} /> Import repo into this project
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">Replaces the project's files with the repository's.</span>
          </button>
          <button
            type="button"
            disabled={!target || working}
            onClick={runPush}
            className={`${secondaryButtonClass} h-auto flex-col items-start gap-0.5 py-2 text-left`}
          >
            <span className="flex items-center gap-1.5">
              <Upload size={13} /> Push this project to repo
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">Keeps your files; repo-only files are added here.</span>
          </button>
        </div>
      )}

      <AlertDialog open={confirmImport} onOpenChange={setConfirmImport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this project's files?</AlertDialogTitle>
            <AlertDialogDescription>
              The {fileCount} file{fileCount === 1 ? "" : "s"} in this project will be replaced with the contents of {selected.fullName}
              {normalizedSubdir ? `/${normalizedSubdir}` : ""} ({branch}). To keep them and send them to GitHub, use "Push this project to repo" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runImport()}>Replace and import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LinkRepoForm;
