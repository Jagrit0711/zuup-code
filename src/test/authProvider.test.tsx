import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";

type Listener = (event: string, session: unknown) => void;
// A developer's .env.local may turn on the local auth bypass; these tests need the real flow.
vi.hoisted(() => vi.stubEnv("VITE_DEV_BYPASS_AUTH", "false"));
const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  auth: {
    getSession: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  ensureProfile: vi.fn(),
  toast: Object.assign(vi.fn(), { warning: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: h.auth }, ZUUP_AUTH_GATEWAY_URL: "https://auth.zuup.dev" }));
vi.mock("@/lib/profile", () => ({ ensureProfile: h.ensureProfile }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { resetAuthRedirectForTests } from "@/lib/authRedirect";
import AuthCallback from "@/pages/AuthCallback";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

const user = { id: "u1", email: "a@zuup.dev", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "" };
const session = { access_token: "A", refresh_token: "R", user };
const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function emit(event: string, s: unknown) {
  act(() => h.listeners.forEach((l) => l(event, s)));
}

beforeEach(() => {
  resetAuthRedirectForTests();
  h.listeners.length = 0;
  h.auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  h.auth.setSession.mockReset().mockResolvedValue({ data: { session }, error: null });
  h.auth.signOut.mockReset().mockResolvedValue({ error: null });
  h.auth.onAuthStateChange.mockReset().mockImplementation((cb: Listener) => {
    h.listeners.push(cb);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  h.ensureProfile.mockReset().mockResolvedValue({ id: "u1", username: "a", display_name: "A", avatar_url: null });
  h.toast.warning.mockReset();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("AuthProvider", () => {
  it("keeps callbacks stable across renders", async () => {
    const seen: unknown[] = [];
    function Probe() {
      const { refreshProfile, signInWithZuup, loading } = useAuth();
      useEffect(() => {
        seen.push(refreshProfile, signInWithZuup);
      });
      return <span>{loading ? "loading" : "ready"}</span>;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText("ready");
    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen.filter((_, i) => i % 2 === 0)).size).toBe(1);
    expect(new Set(seen.filter((_, i) => i % 2 === 1)).size).toBe(1);
  });

  it("signs in from the callback URL once and routes to redirect_to", async () => {
    window.history.replaceState(null, "", "/auth/callback?redirect_to=%2Feditor%3Fproject%3Dp1#access_token=A&refresh_token=R");
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/auth/callback?redirect_to=%2Feditor%3Fproject%3Dp1"]} future={future}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/editor" element={<p>editor page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    await screen.findByText("editor page");
    expect(h.auth.setSession).toHaveBeenCalledTimes(1);
    expect(h.ensureProfile).toHaveBeenCalledTimes(1);
  });

  it("token-only sign-in works, and its expiry gives one toast and one redirect", async () => {
    window.history.replaceState(null, "", "/auth/callback?token=ONLY&redirect_to=%2Feditor");
    const seen: string[] = [];
    function Track() {
      const loc = useLocation();
      useEffect(() => {
        seen.push(loc.pathname);
      }, [loc.pathname]);
      return null;
    }
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/auth/callback?redirect_to=%2Feditor"]} future={future}>
          <Track />
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/editor" element={<ProtectedRoute><p>editor page</p></ProtectedRoute>} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    await screen.findByText("editor page");
    expect(h.auth.setSession).toHaveBeenCalledWith({ access_token: "ONLY", refresh_token: "ONLY" });

    // The bogus refresh token fails once the access token expires: Supabase signs out. Extra
    // SIGNED_OUT events (other tabs, retries) must not add toasts or redirects.
    emit("SIGNED_OUT", null);
    await screen.findByText("login page");
    emit("SIGNED_OUT", null);
    emit("SIGNED_OUT", null);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.toast.warning).toHaveBeenCalledTimes(1);
    expect(h.toast.warning).toHaveBeenCalledWith("Your session expired", expect.anything());
    expect(seen.filter((p) => p === "/login")).toHaveLength(1);
    expect(seen.at(-1)).toBe("/login");
  });

  it("shows a clear error and a sign-in-again path for gateway errors and rejected tokens", async () => {
    window.history.replaceState(null, "", "/auth/callback?error=access_denied&error_description=Link%20expired");
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/auth/callback"]} future={future}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(await screen.findByText("Link expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in again/i })).toBeInTheDocument();
    expect(h.auth.setSession).not.toHaveBeenCalled();
  });

  it("waits for the SSO tokens before ProtectedRoute decides, so it does not bounce to /login", async () => {
    let resolveSet: (v: unknown) => void = () => {};
    h.auth.setSession.mockReturnValue(new Promise((r) => (resolveSet = r)));
    window.history.replaceState(null, "", "/editor#access_token=A&refresh_token=R");
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/editor"]} future={future}>
          <Routes>
            <Route path="/editor" element={<ProtectedRoute><p>editor page</p></ProtectedRoute>} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    // Supabase reports "no session yet" while our setSession is still pending.
    await waitFor(() => expect(h.listeners.length).toBe(1));
    emit("INITIAL_SESSION", null);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("login page")).toBeNull();
    resolveSet({ data: { session }, error: null });
    await screen.findByText("editor page");
  });

  it("tells the user when the session expires, but not when they sign out", async () => {
    h.auth.getSession.mockResolvedValue({ data: { session } });
    let api: ReturnType<typeof useAuth> | null = null;
    function Probe() {
      api = useAuth();
      return <span>{api.user ? "in" : "out"}</span>;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText("in");
    emit("SIGNED_OUT", null);
    await screen.findByText("out");
    expect(h.toast.warning).toHaveBeenCalledWith("Your session expired", expect.anything());

    h.toast.warning.mockReset();
    emit("SIGNED_IN", session);
    await screen.findByText("in");
    await act(async () => {
      await api!.signOut();
    });
    emit("SIGNED_OUT", null);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.toast.warning).not.toHaveBeenCalled();
  });

  it("shows a non-blocking offline notice", async () => {
    render(<AuthProvider><span /></AuthProvider>);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(h.toast.warning).toHaveBeenCalledWith("You're offline", expect.objectContaining({ id: "connectivity" }));
  });
});
