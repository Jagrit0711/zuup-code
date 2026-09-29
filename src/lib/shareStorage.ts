import { supabase } from "@/lib/supabase";
import { generateShareUrl, generateProjectUrl } from "@/lib/sharing";

export interface ShareFile {
  name: string;
  language: string;
  content: string;
}

export interface CodeShare {
  id: string;
  type: "file" | "project";
  title: string;
  language: string;
  files: ShareFile[];
  created_by: string | null;
  views: number;
  created_at: string;
}

// Generate a short random ID (8 chars, URL-safe)
function generateShareId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Get base URL
function getBaseUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return window.location.origin;
  }
  return "https://code.zuup.dev";
}

/**
 * Create a share for a single file.
 * Returns the share URL or falls back to encoded share URL on DB error.
 */
export async function createFileShare(
  fileName: string,
  code: string,
  language: string
): Promise<{ url: string; id: string } | null> {
  const id = generateShareId();

  try {
    // Get current user (optional — anon shares are fine)
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;

    const { error } = await supabase.from("code_shares").insert({
      id,
      type: "file",
      title: fileName,
      language,
      files: [{ name: fileName, language, content: code }],
      created_by: userId,
    });

    if (!error) {
      return { url: `${getBaseUrl()}/share/${id}`, id };
    }

    console.warn("Supabase code_shares unavailable, using URL-encoded share fallback:", error.message);
  } catch (err) {
    console.warn("Share creation exception, falling back:", err);
  }

  // Resilient fallback: URL-based encoded share
  return { url: generateShareUrl(fileName, code, language), id };
}

/**
 * Create a share for an entire project (multiple files).
 * Returns the share URL or falls back to encoded share URL on DB error.
 */
export async function createProjectShare(
  projectName: string,
  files: ShareFile[],
  primaryLanguage: string
): Promise<{ url: string; id: string } | null> {
  const id = generateShareId();

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;

    const { error } = await supabase.from("code_shares").insert({
      id,
      type: "project",
      title: projectName,
      language: primaryLanguage,
      files,
      created_by: userId,
    });

    if (!error) {
      return { url: `${getBaseUrl()}/share/${id}`, id };
    }

    console.warn("Supabase code_shares unavailable, using project URL-encoded share fallback:", error.message);
  } catch (err) {
    console.warn("Project share creation exception, falling back:", err);
  }

  // Resilient fallback: Project URL-encoded share
  return {
    url: generateProjectUrl(
      projectName,
      files.map((f) => ({ fileName: f.name, code: f.content, language: f.language }))
    ),
    id,
  };
}

/**
 * Fetch a share by its short ID.
 * Also increments the view counter.
 */
export async function getShare(id: string): Promise<CodeShare | null> {
  const { data, error } = await supabase
    .from("code_shares")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("Error fetching share:", error);
    return null;
  }

  // Increment views in the background (fire and forget)
  supabase.rpc("increment_share_views", { share_id: id }).then(() => {});

  return data as CodeShare;
}
