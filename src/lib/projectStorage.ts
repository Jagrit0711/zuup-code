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

// Helper: get current auth user id
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Fetch all projects for current user ──────────────
export async function getUserProjects(): Promise<SavedProject[]> {
  const { data, error } = await supabase
    .from("code_projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
  return data ?? [];
}

// ── Get a single project ─────────────────────────────
export async function getProject(id: string): Promise<SavedProject | null> {
  const { data, error } = await supabase
    .from("code_projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching project:", error);
    return null;
  }
  return data;
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
  if (!userId) {
    console.error("Cannot create project: not signed in");
    return null;
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
    console.error("Error creating project:", error);
    return null;
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
  const { data, error } = await supabase
    .from("code_projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
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
  const { error } = await supabase
    .from("code_projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting project:", error);
    return false;
  }
  return true;
}
