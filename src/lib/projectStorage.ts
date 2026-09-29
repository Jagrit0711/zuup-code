import { supabase } from "@/lib/supabase";

export interface SavedProject {
  id: string;
  user_id: string;
  name: string;
  description: string;
  language: string;
  files: ProjectFile[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  name: string;
  language: string;
  content: string;
}

const LOCAL_STORAGE_KEY = "zuup_code_local_projects";

// Helper to access local guest projects
function getLocalProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: SavedProject[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

// Helper: get current auth user id
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Fetch all projects for current user ──────────────
export async function getUserProjects(): Promise<SavedProject[]> {
  const userId = await currentUserId();

  if (userId) {
    // Sync any guest projects created before logging in
    await syncLocalProjectsToCloud(userId);

    const { data, error } = await supabase
      .from("code_projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("Error fetching projects from Supabase, checking local cache:", error.message);
      return getLocalProjects();
    }
    return data ?? [];
  }

  // Guest mode fallback
  return getLocalProjects();
}

// ── Get a single project ─────────────────────────────
export async function getProject(id: string): Promise<SavedProject | null> {
  const { data, error } = await supabase
    .from("code_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (data && !error) {
    return data;
  }

  // Fallback to local storage
  const local = getLocalProjects().find((p) => p.id === id);
  return local || null;
}

// ── Create a new project ─────────────────────────────
export async function createProject(
  name: string,
  description: string,
  language: string,
  files: ProjectFile[],
  isPublic = false
): Promise<SavedProject | null> {
  const userId = await currentUserId();
  const now = new Date().toISOString();

  if (!userId) {
    // Guest mode: save locally
    const localProj: SavedProject = {
      id: "local_" + Math.random().toString(36).substring(2, 10),
      user_id: "guest",
      name,
      description,
      language,
      files,
      is_public: isPublic,
      created_at: now,
      updated_at: now,
    };
    const current = getLocalProjects();
    saveLocalProjects([localProj, ...current]);
    return localProj;
  }

  const { data, error } = await supabase
    .from("code_projects")
    .insert({
      user_id: userId,
      name,
      description,
      language,
      files,
      is_public: isPublic,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating project in Supabase:", error);
    // Fallback to local
    const localProj: SavedProject = {
      id: "local_" + Math.random().toString(36).substring(2, 10),
      user_id: userId,
      name,
      description,
      language,
      files,
      is_public: isPublic,
      created_at: now,
      updated_at: now,
    };
    const current = getLocalProjects();
    saveLocalProjects([localProj, ...current]);
    return localProj;
  }
  return data;
}

// ── Update an existing project ───────────────────────
export async function updateProject(
  id: string,
  updates: {
    name?: string;
    description?: string;
    language?: string;
    files?: ProjectFile[];
    is_public?: boolean;
  }
): Promise<SavedProject | null> {
  const now = new Date().toISOString();

  if (id.startsWith("local_")) {
    const current = getLocalProjects();
    const idx = current.findIndex((p) => p.id === id);
    if (idx !== -1) {
      current[idx] = { ...current[idx], ...updates, updated_at: now };
      saveLocalProjects(current);
      return current[idx];
    }
  }

  const { data, error } = await supabase
    .from("code_projects")
    .update({ ...updates, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating project:", error);
    return null;
  }
  return data;
}

// ── Delete a project ─────────────────────────────────
export async function deleteProject(id: string): Promise<boolean> {
  if (id.startsWith("local_")) {
    const current = getLocalProjects().filter((p) => p.id !== id);
    saveLocalProjects(current);
    return true;
  }

  const { error } = await supabase
    .from("code_projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting project:", error);
    return false;
  }

  // Also remove from local cache if it was stored there
  const current = getLocalProjects().filter((p) => p.id !== id);
  saveLocalProjects(current);
  return true;
}

// ── Sync local guest projects to Supabase Cloud on login ──
export async function syncLocalProjectsToCloud(userId: string): Promise<number> {
  const localProjects = getLocalProjects().filter((p) => p.user_id === "guest" || p.id.startsWith("local_"));
  if (localProjects.length === 0) return 0;

  let synced = 0;
  for (const proj of localProjects) {
    try {
      const { error } = await supabase.from("code_projects").insert({
        user_id: userId,
        name: proj.name,
        description: proj.description,
        language: proj.language,
        files: proj.files,
        is_public: proj.is_public,
      });
      if (!error) synced++;
    } catch {
      // continue
    }
  }

  // Clear migrated local projects
  if (synced > 0) {
    const remaining = getLocalProjects().filter((p) => !p.id.startsWith("local_"));
    saveLocalProjects(remaining);
  }
  return synced;
}

// ── Supabase Storage Bucket File Uploads ──
export async function uploadProjectAsset(
  bucket: string,
  filePath: string,
  file: Blob | File
): Promise<{ path: string; url: string } | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { upsert: true });

    if (error || !data) {
      console.warn("Storage upload error:", error?.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return { path: data.path, url: urlData.publicUrl };
  } catch (err) {
    console.error("Storage upload exception:", err);
    return null;
  }
}

