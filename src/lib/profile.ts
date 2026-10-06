import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  user_id?: string;
  username: string | null;
  display_name: string | null;
  full_name?: string | null;
  avatar_url: string | null;
  api_key?: string;
  is_public?: boolean;
  email_notifications?: boolean;
  created_at?: string;
  updated_at?: string;
}

let remoteProfileTableAvailable = true;

/**
 * Ensure a profile row exists for the given auth user.
 * Checks `user_profile_details` first (the shared Zuup table in Supabase),
 * falls back to `profiles` or user metadata if not present.
 */
export async function ensureProfile(user: User): Promise<Profile | null> {
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "User";

  const avatarUrl = user.user_metadata?.avatar_url || null;
  const username =
    user.user_metadata?.preferred_username ||
    user.user_metadata?.user_name ||
    user.email?.split("@")[0] ||
    null;

  if (!remoteProfileTableAvailable) {
    return {
      id: user.id,
      user_id: user.id,
      username,
      display_name: displayName,
      full_name: displayName,
      avatar_url: avatarUrl,
      api_key: "",
      is_public: true,
      email_notifications: true,
      created_at: user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  try {
    // 1. Check user_profile_details (active Zuup table)
    const { data: userDetails, error: detailsErr } = await supabase
      .from("user_profile_details")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (detailsErr && (detailsErr.code === "PGRST301" || detailsErr.code === "42P01" || detailsErr.message?.includes("denied") || detailsErr.message?.includes("does not exist"))) {
      remoteProfileTableAvailable = false;
    }

    if (userDetails && !detailsErr) {
      return {
        id: userDetails.user_id,
        user_id: userDetails.user_id,
        username: userDetails.username || username,
        display_name: userDetails.full_name || displayName,
        full_name: userDetails.full_name,
        avatar_url: userDetails.avatar_url || avatarUrl,
        api_key: "",
        is_public: true,
        email_notifications: true,
        created_at: userDetails.updated_at || user.created_at || new Date().toISOString(),
        updated_at: userDetails.updated_at || new Date().toISOString(),
      };
    }

    // Try upserting into user_profile_details if not found
    if (!userDetails && !detailsErr) {
      const { data: inserted } = await supabase
        .from("user_profile_details")
        .upsert({
          user_id: user.id,
          email: user.email,
          full_name: displayName,
          username: username,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (inserted) {
        return {
          id: inserted.user_id,
          user_id: inserted.user_id,
          username: inserted.username,
          display_name: inserted.full_name,
          full_name: inserted.full_name,
          avatar_url: inserted.avatar_url,
          api_key: "",
          is_public: true,
          email_notifications: true,
          created_at: inserted.updated_at || new Date().toISOString(),
          updated_at: inserted.updated_at || new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn("user_profile_details query skipped:", err);
  }

  // 2. Fallback to `profiles` table if present in schema
  try {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileRow) {
      return {
        ...profileRow,
        user_id: profileRow.id,
      } as Profile;
    }
  } catch {
    // profiles table might not exist
  }

  // 3. Fallback to synthesizing profile from auth user object
  return {
    id: user.id,
    user_id: user.id,
    username: username,
    display_name: displayName,
    full_name: displayName,
    avatar_url: avatarUrl,
    api_key: "",
    is_public: true,
    email_notifications: true,
    created_at: user.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fetch the current user's profile from the database.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  // Try user_profile_details first
  try {
    const { data: details } = await supabase
      .from("user_profile_details")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (details) {
      return {
        id: details.user_id,
        user_id: details.user_id,
        username: details.username,
        display_name: details.full_name || details.username,
        full_name: details.full_name,
        avatar_url: details.avatar_url,
        api_key: "",
        is_public: true,
        email_notifications: true,
        created_at: details.updated_at || new Date().toISOString(),
        updated_at: details.updated_at || new Date().toISOString(),
      };
    }
  } catch {
    // ignore
  }

  // Fallback to profiles table
  try {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (data) return data as Profile;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Update the user's profile in the database and Supabase Auth metadata.
 */
export async function updateProfile(
  userId: string,
  updates: { display_name?: string | null; username?: string | null; avatar_url?: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update Auth user metadata
    const { error: authErr } = await supabase.auth.updateUser({
      data: {
        full_name: updates.display_name,
        name: updates.display_name,
        preferred_username: updates.username,
        avatar_url: updates.avatar_url,
      },
    });

    // Update user_profile_details
    const { error: detailsErr } = await supabase
      .from("user_profile_details")
      .upsert({
        user_id: userId,
        full_name: updates.display_name,
        username: updates.username,
        avatar_url: updates.avatar_url,
        updated_at: new Date().toISOString(),
      });

    if (!detailsErr) return { success: true };

    // Try profiles table fallback
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        display_name: updates.display_name,
        username: updates.username,
        avatar_url: updates.avatar_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (!profileErr) return { success: true };

    // Neither table accepted the change; it only counts if the auth metadata was saved.
    if (authErr) return { success: false, error: authErr.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

