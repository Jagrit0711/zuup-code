import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  api_key: string;
  is_public: boolean;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Ensure a `profiles` row exists for the given auth user.
 * Uses upsert so it's safe to call on every sign-in / auth change.
 * Only sets display_name and avatar_url on first creation (won't overwrite).
 */
export async function ensureProfile(user: User): Promise<Profile | null> {
  // First, check if profile already exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (existing) return existing as Profile;

  // Profile doesn't exist — create one
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    null;

  const avatarUrl =
    user.user_metadata?.avatar_url || null;

  const username =
    user.user_metadata?.preferred_username ||
    user.user_metadata?.user_name ||
    null;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      username: username,
    })
    .select()
    .single();

  if (error) {
    // If insert fails (race condition — profile was created by another app),
    // just fetch it
    console.warn("Profile insert failed (may already exist):", error.message);
    const { data: fallback } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    return fallback as Profile | null;
  }

  return data as Profile;
}

/**
 * Fetch the current user's profile from the `profiles` table.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
  return data as Profile;
}
