import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase, ZUUP_AUTH_GATEWAY_URL } from "@/lib/supabase";
import { ensureProfile, type Profile } from "@/lib/profile";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithZuup: (returnUrl?: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Ensure a profiles row exists whenever we have a user
  const syncProfile = async (authUser: User | null) => {
    if (authUser) {
      const p = await ensureProfile(authUser);
      setProfile(p);
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        // 1. Check for Zuup Auth tokens in search params or hash
        const searchParams = new URLSearchParams(window.location.search);
        const tokenParam = searchParams.get("token");

        const hash = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token") || tokenParam;
        const refreshToken = hashParams.get("refresh_token") || accessToken;

        if (accessToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || accessToken,
          });

          if (!error && data?.session) {
            setSession(data.session);
            setUser(data.session.user);
            await syncProfile(data.session.user);

            // Clean up tokens from URL without reloading
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("token");
            cleanUrl.searchParams.delete("code");
            cleanUrl.hash = "";
            window.history.replaceState(
              {},
              document.title,
              cleanUrl.pathname + (cleanUrl.search || "")
            );
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Error processing Zuup Auth callback:", err);
      }

      // 2. Fetch existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        syncProfile(session?.user ?? null).then(() => setLoading(false));
      });
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        syncProfile(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const signInWithGitHub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const signInWithZuup = (returnUrl?: string) => {
    const targetPath = returnUrl || "/editor";
    let destination: string;
    if (targetPath.startsWith("http://") || targetPath.startsWith("https://")) {
      destination = targetPath;
    } else {
      const cleanPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
      destination = `${window.location.origin}/auth/callback?redirect_to=${encodeURIComponent(cleanPath)}`;
    }
    const targetUrl = new URL(`${ZUUP_AUTH_GATEWAY_URL}/login`);
    targetUrl.searchParams.set("redirect_to", destination);
    window.location.href = targetUrl.toString();
  };

  const refreshProfile = async () => {
    if (user) {
      await syncProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithGitHub,
        signInWithGoogle,
        signInWithZuup,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

