import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ensureProfile, type Profile } from "@/lib/profile";
import { buildZuupLoginUrl, consumeAuthRedirect } from "@/lib/authRedirect";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  /** Message from a failed SSO sign-in (bad or incomplete tokens, gateway error). */
  authError: string | null;
  clearAuthError: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithZuup: (returnUrl?: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Local-development-only auth bypass so the editor/dashboard can be exercised without the
// Zuup SSO round-trip. `import.meta.env.DEV` is statically `false` in production builds, so this
// whole branch (and the fake user below) is removed by the bundler and can never ship.
const DEV_BYPASS_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

const DEV_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  email: "dev@zuup.test",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  created_at: "2026-01-01T00:00:00.000Z",
} as User;

const DEV_PROFILE: Profile = {
  id: DEV_USER.id,
  username: "dev",
  display_name: "Dev User",
  avatar_url: null,
  created_at: DEV_USER.created_at,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEV_BYPASS_AUTH ? DEV_USER : null);
  const [profile, setProfile] = useState<Profile | null>(DEV_BYPASS_AUTH ? DEV_PROFILE : null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!DEV_BYPASS_AUTH);
  const [authError, setAuthError] = useState<string | null>(null);

  // Refs let stable callbacks see the latest values without re-creating them every render.
  const userRef = useRef<User | null>(user);
  const profileRequest = useRef(0);
  const signingOut = useRef(false);
  // Until the URL tokens are consumed, a null INITIAL_SESSION must not end `loading`, or
  // ProtectedRoute would bounce to /login while the SSO session is still being set up.
  const ready = useRef(false);

  // Ensure a profiles row exists whenever we have a user. Only the newest request may set state,
  // so a slow lookup for an old user cannot overwrite the current profile.
  const syncProfile = useCallback(async (authUser: User | null) => {
    const request = ++profileRequest.current;
    if (!authUser) {
      setProfile(null);
      return;
    }
    try {
      const p = await ensureProfile(authUser);
      if (request === profileRequest.current) setProfile(p);
    } catch (err) {
      console.warn("Could not load profile:", err);
    }
  }, []);

  const applySession = useCallback(
    (next: Session | null) => {
      const prevId = userRef.current?.id ?? null;
      const nextUser = next?.user ?? null;
      userRef.current = nextUser;
      setSession(next);
      setUser(nextUser);
      // Token refreshes keep the same user; only look the profile up again when the user changes.
      if ((nextUser?.id ?? null) !== prevId) void syncProfile(nextUser);
    },
    [syncProfile]
  );

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    let active = true;

    consumeAuthRedirect().then((result) => {
      if (!active) return;
      ready.current = true;
      if (result.error) setAuthError(result.error.message);
      applySession(result.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      // Defer: calling other Supabase methods inside this callback can deadlock the auth lock.
      setTimeout(() => {
        if (!active || (!ready.current && event === "INITIAL_SESSION")) return;
        const hadUser = userRef.current !== null;
        if (event === "SIGNED_OUT" && hadUser && !signingOut.current) {
          // The session ended without the user asking (refresh token expired or revoked).
          toast.warning("Your session expired", {
            id: "session-expired",
            description: "Sign in again to keep saving your projects to your account.",
            duration: 10000,
          });
        }
        if (event === "SIGNED_OUT") signingOut.current = false;
        applySession(next);
        if (ready.current) setLoading(false);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  // Connectivity notice: non-blocking, and only one at a time.
  useEffect(() => {
    const offline = () =>
      toast.warning("You're offline", {
        id: "connectivity",
        description: "Saving to your account will resume when you reconnect.",
        duration: Infinity,
      });
    const online = () => toast.success("Back online", { id: "connectivity", duration: 3000 });
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Sign out failed:", err);
    }
    applySession(null);
  }, [applySession]);

  const signInWithGitHub = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  }, []);

  const signInWithZuup = useCallback((returnUrl?: string) => {
    window.location.href = buildZuupLoginUrl(window.location.origin, returnUrl);
  }, []);

  const refreshProfile = useCallback(async () => {
    await syncProfile(userRef.current);
  }, [syncProfile]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      session,
      loading,
      authError,
      clearAuthError,
      signIn,
      signUp,
      signOut,
      signInWithGitHub,
      signInWithGoogle,
      signInWithZuup,
      refreshProfile,
    }),
    [user, profile, session, loading, authError, clearAuthError, signIn, signUp, signOut, signInWithGitHub, signInWithGoogle, signInWithZuup, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

