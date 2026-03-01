import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProjects, deleteProject, createProject, SavedProject } from "@/lib/projectStorage";
import { supabase } from "@/lib/supabase";
import { languages } from "@/lib/languages";
import {
  Plus, Code2, Trash2, Clock, Globe, Lock, LogOut, FolderOpen, Loader2, Search,
  Upload, Download, Settings, User, FileCode, HardDrive, ArrowRight, Edit3,
  Check, X, Camera, Package, LayoutGrid, List, Archive,
} from "lucide-react";
import { toast } from "sonner";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

type Tab = "projects" | "files" | "settings";

const Dashboard = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("projects");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    display_name: "",
    username: "",
    avatar_url: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Download all state
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        display_name: profile.display_name || "",
        username: profile.username || "",
        avatar_url: profile.avatar_url || "",
      });
    }
  }, [profile]);

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

  // Upload files → create project → navigate to editor
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);

    const results: { name: string; language: string; content: string }[] = [];
    let remaining = fileList.length;
    const projectName = fileList.length === 1
      ? fileList[0].name.replace(/\.[^.]+$/, "")
      : `Uploaded Project (${new Date().toLocaleDateString()})`;

    const processComplete = async () => {
      if (results.length === 0) {
        toast.error("No valid files to upload");
        setIsUploading(false);
        return;
      }

      // Detect primary language
      const langCounts: Record<string, number> = {};
      results.forEach(f => {
        langCounts[f.language] = (langCounts[f.language] || 0) + 1;
      });
      const primaryLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "python";

      const saved = await createProject(projectName, "", primaryLang, results);
      if (saved) {
        toast.success(`Uploaded "${projectName}" with ${results.length} file(s)`);
        navigate(`/editor?project=${saved.id}`);
      } else {
        toast.error("Failed to create project from upload");
      }
      setIsUploading(false);
    };

    Array.from(fileList).forEach((file) => {
      if (file.size > 2 * 1024 * 1024) {
        remaining--;
        if (remaining <= 0) processComplete();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const lang = languages.find(l => l.extension === `.${ext}`)?.id || "plaintext";
        results.push({ name: file.name, language: lang, content: reader.result as string });
        remaining--;
        if (remaining <= 0) processComplete();
      };
      reader.onerror = () => {
        remaining--;
        if (remaining <= 0) processComplete();
      };
      reader.readAsText(file);
    });

    e.target.value = "";
  };

  // Download all projects as JSON
  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const allProjects = await getUserProjects();
      const exportData = {
        exported_at: new Date().toISOString(),
        user_email: user?.email,
        project_count: allProjects.length,
        projects: allProjects.map(p => ({
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
      toast.success(`Exported ${allProjects.length} projects`);
    } catch {
      toast.error("Failed to export data");
    }
    setDownloading(false);
  };

  // Save profile
  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profileForm.display_name.trim() || null,
        username: profileForm.username.trim() || null,
        avatar_url: profileForm.avatar_url.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      toast.error("Failed to update profile: " + error.message);
    } else {
      toast.success("Profile updated!");
      setEditingProfile(false);
      // Reload page to refresh profile context
      window.location.reload();
    }
    setSavingProfile(false);
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.language.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(search.toLowerCase())
  );

  // Aggregate stats
  const totalFiles = projects.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  const languageSet = new Set(projects.map(p => p.language));

  const displayName = profile?.display_name || profile?.username || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Developer";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;

  // All files across all projects for the Files tab
  const allFiles = projects.flatMap(p =>
    (p.files || []).map(f => ({ ...f, projectId: p.id, projectName: p.name }))
  );
  const filteredFiles = allFiles.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.projectName.toLowerCase().includes(search.toLowerCase())
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "projects", label: "Projects", icon: <FolderOpen size={14} />, count: projects.length },
    { id: "files", label: "All Files", icon: <FileCode size={14} />, count: totalFiles },
    { id: "settings", label: "Settings", icon: <Settings size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Navbar ─── */}
      <nav className="border-b border-border/40 glass-strong sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src={LOGO} alt="Zuup" className="h-7 w-7 rounded group-hover:scale-110 transition-transform" />
            <span className="font-bold">Zuup</span>
            <span className="font-light text-primary">Code</span>
          </Link>
          <div className="flex items-center gap-3">
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Greeting + Stats */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">
              Welcome back, <span className="text-primary">{displayName}</span>
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><FolderOpen size={13} /> {projects.length} projects</span>
              <span className="flex items-center gap-1"><FileCode size={13} /> {totalFiles} files</span>
              <span className="flex items-center gap-1"><Code2 size={13} /> {languageSet.size} languages</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAll}
              disabled={downloading || projects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
              title="Download all projects as JSON backup"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
              Export All
            </button>
            <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden"
              accept=".py,.js,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.sh,.bat" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
              title="Upload files to create a new project"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload
            </button>
            <button
              onClick={() => navigate("/editor?new=true")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} />
              New Project
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border/40 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1 rounded-full bg-secondary/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ Projects Tab ═══ */}
        {activeTab === "projects" && (
          <>
            {/* Search + View Toggle */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
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
              <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <List size={14} />
                </button>
              </div>
            </div>

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
                  {search ? "Try a different search term" : "Create your first project or upload files to get started"}
                </p>
                {!search && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate("/editor?new=true")}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Plus size={16} />
                      New Project
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Upload size={16} />
                      Upload Files
                    </button>
                  </div>
                )}
              </div>
            ) : viewMode === "grid" ? (
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
                          <h3 className="font-semibold text-sm truncate max-w-[180px]">{project.name}</h3>
                        </div>
                        {project.is_public ? (
                          <span title="Public"><Globe size={14} className="text-muted-foreground" /></span>
                        ) : (
                          <span title="Private"><Lock size={14} className="text-muted-foreground" /></span>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">{project.language}</span>
                          <span className="text-[10px] text-muted-foreground/50">{project.files?.length || 0} files</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                          <Clock size={11} />
                          {new Date(project.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                    <div className="border-t border-border/30 px-5 py-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.preventDefault(); handleDelete(project.id, project.name); }}
                        disabled={deleting === project.id}
                        className="text-destructive/60 hover:text-destructive text-xs flex items-center gap-1 transition-colors"
                      >
                        {deleting === project.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* List view */
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30 bg-secondary/20 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Language</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Files</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Updated</th>
                      <th className="text-right px-4 py-2.5 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(project => (
                      <tr key={project.id} className="border-b border-border/20 hover:bg-secondary/20 transition-colors group">
                        <td className="px-4 py-3">
                          <Link to={`/editor?project=${project.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                            <Code2 size={14} className="text-primary shrink-0" />
                            <div>
                              <div className="text-sm font-medium">{project.name}</div>
                              {project.description && <div className="text-[11px] text-muted-foreground truncate max-w-[250px]">{project.description}</div>}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">{project.language}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{project.files?.length || 0}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{new Date(project.updated_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(project.id, project.name)}
                            disabled={deleting === project.id}
                            className="text-destructive/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                          >
                            {deleting === project.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ═══ Files Tab ═══ */}
        {activeTab === "files" && (
          <>
            <div className="relative max-w-md mb-6">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search all files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border/40 bg-secondary/30 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="text-primary animate-spin" />
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/40 rounded-xl">
                <FileCode size={48} className="text-muted-foreground/40 mb-4" />
                <h3 className="font-semibold mb-1">{search ? "No matching files" : "No files yet"}</h3>
                <p className="text-sm text-muted-foreground">
                  {search ? "Try a different search" : "Create a project to see files here"}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30 bg-secondary/20 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">File</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Project</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Language</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Size</th>
                      <th className="text-right px-4 py-2.5 font-medium w-20">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map((f, i) => (
                      <tr key={`${f.projectId}-${f.name}-${i}`} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileCode size={14} className="text-primary shrink-0" />
                            <span className="text-sm font-mono">{f.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{f.projectName}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">{f.language}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                          {(f.content.length / 1024).toFixed(1)} KB
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/editor?project=${f.projectId}`}
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ═══ Settings Tab ═══ */}
        {activeTab === "settings" && (
          <div className="max-w-2xl space-y-8">
            {/* Profile Section */}
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 bg-secondary/10">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-primary" />
                  <h3 className="text-sm font-semibold">Profile</h3>
                </div>
                {!editingProfile ? (
                  <button
                    onClick={() => setEditingProfile(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Edit3 size={12} />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingProfile(false); setProfileForm({ display_name: profile?.display_name || "", username: profile?.username || "", avatar_url: profile?.avatar_url || "" }); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={12} />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      {savingProfile ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Save
                    </button>
                  </div>
                )}
              </div>
              <div className="p-6 space-y-5">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-primary/30" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-lg font-bold text-primary">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{displayName}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>

                {editingProfile ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Display Name</label>
                      <input
                        type="text"
                        value={profileForm.display_name}
                        onChange={e => setProfileForm(prev => ({ ...prev, display_name: e.target.value }))}
                        className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        placeholder="Your display name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Username</label>
                      <input
                        type="text"
                        value={profileForm.username}
                        onChange={e => setProfileForm(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        placeholder="username"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Avatar URL</label>
                      <input
                        type="text"
                        value={profileForm.avatar_url}
                        onChange={e => setProfileForm(prev => ({ ...prev, avatar_url: e.target.value }))}
                        className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        placeholder="https://example.com/avatar.jpg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Display Name</p>
                      <p className="text-sm">{profile?.display_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Username</p>
                      <p className="text-sm">{profile?.username || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Email</p>
                      <p className="text-sm">{user?.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Member Since</p>
                      <p className="text-sm">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Storage / Data Section */}
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-border/30 bg-secondary/10">
                <HardDrive size={16} className="text-primary" />
                <h3 className="text-sm font-semibold">Data & Storage</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-secondary/30 p-4 text-center">
                    <p className="text-2xl font-bold text-primary">{projects.length}</p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-4 text-center">
                    <p className="text-2xl font-bold text-primary">{totalFiles}</p>
                    <p className="text-xs text-muted-foreground">Total Files</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-4 text-center">
                    <p className="text-2xl font-bold text-primary">{languageSet.size}</p>
                    <p className="text-xs text-muted-foreground">Languages</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleDownloadAll}
                    disabled={downloading || projects.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border/60 px-4 py-3 text-sm hover:bg-secondary transition-all disabled:opacity-40"
                  >
                    {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Export All Data (JSON)
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border/60 px-4 py-3 text-sm hover:bg-secondary transition-all disabled:opacity-40"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Import Files
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-destructive/30 overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-destructive/20 bg-destructive/5">
                <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Sign Out</p>
                    <p className="text-xs text-muted-foreground">Sign out of your account on this device</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
