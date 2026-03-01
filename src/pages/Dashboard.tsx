import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProjects, deleteProject, SavedProject } from "@/lib/projectStorage";
import {
  Plus, Code2, Trash2, Clock, Globe, Lock, LogOut, FolderOpen, Loader2, Search,
} from "lucide-react";
import { toast } from "sonner";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

const Dashboard = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const data = await getUserProjects();
    setProjects(data);
    setLoading(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    const ok = await deleteProject(id);
    if (ok) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success(`Deleted "${name}"`);
    } else {
      toast.error("Failed to delete project");
    }
    setDeleting(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.language.toLowerCase().includes(search.toLowerCase())
  );

  const displayName = profile?.display_name || profile?.username || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Developer";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Navbar ─── */}
      <nav className="border-b border-border/40 glass-strong sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={LOGO} alt="Zuup" className="h-7 w-7 rounded" />
            <span className="font-bold">Zuup</span>
            <span className="font-light text-primary">Code</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/editor"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Code2 size={14} />
              Open Editor
            </Link>
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-8 w-8 rounded-full border border-primary/30 object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                  {initials}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Content ─── */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">
            Welcome back, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            {projects.length} project{projects.length !== 1 ? "s" : ""} saved · Your code, your cloud
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border/40 bg-secondary/30 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
          </div>
          <Link
            to="/editor"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus size={16} />
            New Project
          </Link>
        </div>

        {/* Project Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="text-primary animate-spin mb-4" />
            <p className="text-muted-foreground text-sm">Loading projects...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/40 rounded-xl">
            <FolderOpen size={48} className="text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">
              {search ? "No matching projects" : "No projects yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search
                ? "Try a different search term"
                : "Create your first project to get started"}
            </p>
            {!search && (
              <Link
                to="/editor"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
                New Project
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card/80 transition-all duration-300 overflow-hidden"
              >
                <Link to={`/editor?project=${project.id}`} className="block p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Code2 size={16} className="text-primary" />
                      <h3 className="font-semibold text-sm truncate max-w-[180px]">
                        {project.name}
                      </h3>
                    </div>
                    {project.is_public ? (
                      <span title="Public"><Globe size={14} className="text-muted-foreground" /></span>
                    ) : (
                      <span title="Private"><Lock size={14} className="text-muted-foreground" /></span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {project.language}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                      <Clock size={11} />
                      {new Date(project.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
                <div className="border-t border-border/30 px-5 py-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(project.id, project.name);
                    }}
                    disabled={deleting === project.id}
                    className="text-destructive/60 hover:text-destructive text-xs flex items-center gap-1 transition-colors"
                  >
                    {deleting === project.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
