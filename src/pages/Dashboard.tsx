import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  createProject,
  deleteProject,
  duplicateProject,
  fetchUserProjects,
  ProjectLoadError,
  updateProject,
  type ProjectFile,
  type SavedProject,
} from "@/lib/projectStorage";
import { detectLanguageFromFilename } from "@/lib/languages";
import { ProjectTable, type ProjectTableHandle } from "@/components/dashboard/ProjectTable";
import { AccountSection } from "@/components/dashboard/AccountSection";
import {
  copyName,
  DEFAULT_DIRECTION,
  DEFAULT_SORT,
  filterProjects,
  nextSort,
  primaryLanguage,
  sortProjects,
  type SortKey,
  type SortState,
} from "@/components/dashboard/projectList";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const UNDO_MS = 6000;
const undoToastId = (projectId: string) => `delete-project-${projectId}`;
const UPLOAD_ACCEPT =
  ".py,.js,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.sh,.bat";
const SORT_STORAGE_KEY = "zuup_code_dashboard_sort";

const primaryButton =
  "inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none";
const secondaryButton =
  "inline-flex h-8 items-center rounded-md border border-rule bg-transparent px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none";
const quietButton =
  "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary motion-reduce:transition-none";

type LoadState = { status: "loading" } | { status: "ready" } | { status: "error"; offline: boolean };

function readStoredSort(): SortState {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<SortState>;
    if ((parsed.key === "edited" || parsed.key === "name") && (parsed.direction === "asc" || parsed.direction === "desc")) {
      return { key: parsed.key, direction: parsed.direction };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SORT;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

const Dashboard = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(readStoredSort);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<ProjectTableHandle>(null);
  const pendingDeletes = useRef(new Map<string, { project: SavedProject; timer: number }>());

  const loadProjects = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const data = await fetchUserProjects();
      // Projects waiting on an undo window stay hidden.
      setProjects(data.filter((p) => !pendingDeletes.current.has(p.id)));
      setLoad({ status: "ready" });
    } catch (err) {
      const offline = err instanceof ProjectLoadError ? err.offline : !navigator.onLine;
      setLoad({ status: "error", offline });
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // Retry automatically when the connection comes back after an offline failure.
  useEffect(() => {
    if (load.status !== "error") return;
    const onOnline = () => void loadProjects();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load.status, loadProjects]);

  // Commit any deletes still in their undo window when leaving the page.
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      for (const [id, entry] of pending) {
        window.clearTimeout(entry.timer);
        // The delete is final now, so an Undo button that outlives this page must not stay visible.
        toast.dismiss(undoToastId(id));
        void deleteProject(id);
      }
      pending.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // "/" focuses search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("[role='menu']")) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {
      // ignore
    }
  }, [sort]);

  const rows = useMemo(() => {
    const matches = filterProjects(projects, search);
    const order = sortProjects(
      matches.map((m) => m.project),
      sort,
    );
    const byId = new Map(matches.map((m) => [m.project.id, m]));
    return order.map((p) => byId.get(p.id)!);
  }, [projects, search, sort]);

  const totalFiles = projects.reduce((sum, p) => sum + (p.files?.length ?? 0), 0);
  const displayName =
    profile?.display_name ||
    profile?.username ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Your account";
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;

  const openProject = (project: SavedProject, newTab: boolean) => {
    const url = `/editor?project=${project.id}`;
    if (newTab) window.open(url, "_blank", "noopener");
    else navigate(url);
  };

  const handleSort = (key: SortKey) => setSort((s) => nextSort(s, key));

  const handleRename = async (project: SavedProject, name: string) => {
    setBusyId(project.id);
    const saved = await updateProject(project.id, { name });
    setBusyId(null);
    if (!saved) {
      toast.error("Could not rename the project. Check your connection and try again.");
      return false;
    }
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, ...saved } : p)));
    toast.success("Project renamed");
    return true;
  };

  const handleDuplicate = async (project: SavedProject) => {
    setBusyId(project.id);
    const name = copyName(
      project.name,
      projects.map((p) => p.name),
    );
    const copy = await duplicateProject(project, name);
    setBusyId(null);
    if (!copy) {
      toast.error("Could not duplicate the project. Check your connection and try again.");
      return;
    }
    setProjects((prev) => [copy, ...prev]);
    toast.success(`Project duplicated as "${name}"`);
  };

  const handleDelete = (project: SavedProject) => {
    setProjects((prev) => prev.filter((p) => p.id !== project.id));

    const commit = async () => {
      pendingDeletes.current.delete(project.id);
      const ok = await deleteProject(project.id);
      if (!ok) {
        setProjects((prev) => (prev.some((p) => p.id === project.id) ? prev : [...prev, project]));
        toast.error(`Could not delete "${project.name}". Check your connection and try again.`);
      }
    };
    const timer = window.setTimeout(() => void commit(), UNDO_MS);
    pendingDeletes.current.set(project.id, { project, timer });

    toast("Project deleted", {
      id: undoToastId(project.id),
      description: project.name,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const entry = pendingDeletes.current.get(project.id);
          if (!entry) return;
          window.clearTimeout(entry.timer);
          pendingDeletes.current.delete(project.id);
          setProjects((prev) => (prev.some((p) => p.id === project.id) ? prev : [...prev, entry.project]));
        },
      },
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Upload files, create a project from them and open it.
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length === 0) return;
    setIsUploading(true);

    const tooBig = list.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const read = await Promise.all(
      list
        .filter((f) => f.size <= MAX_UPLOAD_BYTES)
        .map(async (file): Promise<ProjectFile | null> => {
          try {
            return { name: file.name, language: detectLanguageFromFilename(file.name).id, content: await file.text() };
          } catch {
            return null;
          }
        }),
    );
    const files = read.filter((f): f is ProjectFile => f !== null);

    if (files.length === 0) {
      toast.error(
        tooBig.length > 0
          ? "Those files are larger than 2 MB. Upload smaller files."
          : "Could not read those files. Upload plain text source files.",
      );
      setIsUploading(false);
      return;
    }

    const projectName =
      list.length === 1
        ? list[0].name.replace(/\.[^.]+$/, "")
        : `Uploaded ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    const saved = await createProject(projectName, "", primaryLanguage(files), files);
    setIsUploading(false);
    if (!saved) {
      toast.error("Could not create a project from those files. Try again.");
      return;
    }
    const skipped = tooBig.length > 0 ? ` Skipped ${tooBig.length} over 2 MB.` : "";
    toast.success(`Uploaded ${files.length === 1 ? "1 file" : `${files.length} files`}${skipped ? "." + skipped : ""}`);
    navigate(`/editor?project=${saved.id}`);
  };

  // Download every project as one JSON backup.
  const handleExport = async () => {
    setExporting(true);
    try {
      // Projects in their undo window are as good as deleted; leave them out of the backup.
      const all = (await fetchUserProjects()).filter((p) => !pendingDeletes.current.has(p.id));
      const exportData = {
        exported_at: new Date().toISOString(),
        user_email: user?.email,
        project_count: all.length,
        projects: all.map((p) => ({
          name: p.name,
          description: p.description,
          language: p.language,
          is_public: p.is_public,
          created_at: p.created_at,
          updated_at: p.updated_at,
          files: p.files,
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zuup-code-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length === 1 ? "1 project" : `${all.length} projects`}`);
    } catch {
      toast.error("Could not export your projects. Check your connection and try again.");
    }
    setExporting(false);
  };

  const ready = load.status === "ready";
  const empty = ready && projects.length === 0;
  const countLabel = !ready || projects.length === 0
    ? ""
    : search.trim()
      ? `${rows.length} of ${projects.length}`
      : String(projects.length);

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <a
        href="#projects-title"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-[13px]"
      >
        Skip to projects
      </a>

      <header className="sticky top-0 z-40 border-b border-rule bg-panel">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <img src={LOGO} alt="" className="h-5 w-5 rounded-sm" />
            Zuup Code
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-[13px]">
            <Link to="/dashboard" aria-current="page" className={`${quietButton} text-foreground`}>
              Projects
            </Link>
            <Link to="/editor" className={quietButton}>
              Editor
            </Link>
          </nav>
          <a href="#account" className={`${quietButton} ml-auto gap-2 px-1.5 sm:px-2`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-muted-foreground"
              >
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="hidden max-w-[12rem] truncate sm:inline">{displayName}</span>
            <span className="sr-only sm:hidden">Account</span>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <h1
            id="projects-title"
            tabIndex={-1}
            className="flex items-baseline gap-3 font-display text-[32px] font-extrabold leading-none tracking-[-0.02em] focus:outline-none sm:text-[40px]"
          >
            Projects
            {countLabel && (
              <span className="font-sans text-[15px] font-normal tracking-normal text-muted-foreground tabular-nums">
                <span className="sr-only">, </span>
                {countLabel}
              </span>
            )}
          </h1>
          {!empty && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={secondaryButton}
                title="Create a project from files on your computer"
              >
                {isUploading ? "Uploading" : "Upload"}
              </button>
              <button type="button" onClick={() => navigate("/editor?new=true")} className={primaryButton}>
                New project
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleUpload}
          className="hidden"
          accept={UPLOAD_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
        />

        {!empty && (
          <div className="mt-8 flex items-center gap-3">
            <div className="relative w-full max-w-sm">
              <label htmlFor="project-search" className="sr-only">
                Search projects
              </label>
              <input
                id="project-search"
                ref={searchRef}
                type="search"
                value={search}
                autoComplete="off"
                spellCheck={false}
                placeholder="Search projects"
                disabled={!ready}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    tableRef.current?.focusFirstRow();
                  } else if (e.key === "Escape" && search) {
                    e.preventDefault();
                    setSearch("");
                  }
                }}
                className="h-8 w-full rounded-md border border-rule bg-ink pl-2.5 pr-8 text-[13px] text-foreground placeholder:text-faint focus-visible:border-primary/60 focus-visible:outline-none disabled:opacity-60 [&::-webkit-search-cancel-button]:hidden"
              />
              {!search && (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 font-mono text-[11px] text-faint sm:block"
                >
                  /
                </kbd>
              )}
            </div>
            <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground sm:hidden">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={sort.key}
                onChange={(e) => {
                  const key = e.target.value as SortKey;
                  setSort({ key, direction: DEFAULT_DIRECTION[key] });
                }}
                aria-label="Sort projects"
                className="h-8 rounded-md border border-rule bg-ink px-2 text-[13px] text-foreground focus-visible:border-primary/60 focus-visible:outline-none"
              >
                <option value="edited">Last edited</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-4" aria-busy={load.status === "loading"}>
          {load.status === "loading" && <SkeletonRows />}

          {load.status === "error" && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-4">
              <p className="text-[14px] text-muted-foreground">
                <span className="text-danger">
                  {load.offline ? "You are offline." : "Could not load your projects."}
                </span>{" "}
                {load.offline
                  ? "Your projects will load when you reconnect."
                  : "Check your connection and try again."}
              </p>
              <button type="button" onClick={() => void loadProjects()} className={secondaryButton}>
                Retry
              </button>
            </div>
          )}

          {empty && (
            <div className="mt-6 border-t border-rule pt-8">
              <h2 className="text-[15px] font-semibold text-foreground">No projects yet</h2>
              <p className="mt-1 max-w-md text-[14px] text-muted-foreground">
                Start from a blank file, or upload code from your computer to keep working on it here.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <button type="button" onClick={() => navigate("/editor?new=true")} className={primaryButton}>
                  New project
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={secondaryButton}
                >
                  {isUploading ? "Uploading" : "Upload files"}
                </button>
              </div>
            </div>
          )}

          {ready && !empty && rows.length === 0 && (
            <div className="flex flex-wrap items-center gap-3 border-y border-rule py-4 text-[14px] text-muted-foreground">
              <p>
                No projects match <span className="text-foreground">{search.trim()}</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                className={quietButton}
              >
                Clear search
              </button>
            </div>
          )}

          {ready && rows.length > 0 && (
            <ProjectTable
              ref={tableRef}
              rows={rows}
              sort={sort}
              onSort={handleSort}
              onOpen={openProject}
              onRename={handleRename}
              onDuplicate={(p) => void handleDuplicate(p)}
              onDelete={handleDelete}
              onExitTop={() => searchRef.current?.focus()}
              busyId={busyId}
            />
          )}

          {ready && rows.length > 0 && (
            <p className="mt-3 hidden text-[12px] text-faint sm:block">
              <span className="font-mono text-[11px]">/</span> to search,{" "}
              <span className="font-mono text-[11px]">↑</span> <span className="font-mono text-[11px]">↓</span> to move, <span className="font-mono text-[11px]">Enter</span> to open, <span className="font-mono text-[11px]">F2</span> to rename
            </p>
          )}
        </div>

        <AccountSection
          user={user}
          profile={profile}
          displayName={displayName}
          avatarUrl={avatarUrl}
          projectCount={projects.length}
          fileCount={totalFiles}
          exporting={exporting}
          onExport={() => void handleExport()}
          onSignOut={() => void handleSignOut()}
          refreshProfile={refreshProfile}
        />
      </main>
    </div>
  );
};

/** Static placeholder rows shaped like the table, without shimmer. */
function SkeletonRows() {
  const widths = ["w-48", "w-36", "w-56", "w-40"];
  return (
    <div aria-label="Loading projects" role="status">
      <div className="hidden border-b border-rule py-2 sm:block">
        <div className="mx-3 h-3 w-12 rounded-sm bg-raised" />
      </div>
      {widths.map((w) => (
        <div key={w} className="flex items-center gap-6 border-b border-rule px-3 py-3.5">
          <div className={`h-3.5 ${w} max-w-[60%] rounded-sm bg-raised`} />
          <div className="ml-auto hidden h-3 w-16 rounded-sm bg-raised md:block" />
          <div className="hidden h-3 w-6 rounded-sm bg-raised md:block" />
          <div className="ml-auto h-3 w-20 rounded-sm bg-raised md:ml-0" />
          <div className="w-8" />
        </div>
      ))}
    </div>
  );
}

export default Dashboard;
