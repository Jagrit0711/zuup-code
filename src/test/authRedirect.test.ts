import { describe, it, expect, beforeEach, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth },
  ZUUP_AUTH_GATEWAY_URL: "https://auth.zuup.dev",
}));

import {
  buildZuupLoginUrl,
  consumeAuthRedirect,
  loginPathFor,
  readCallbackParams,
  resetAuthRedirectForTests,
} from "@/lib/authRedirect";
import { safeRedirectPath } from "@/lib/safeRedirect";

const fakeSession = { access_token: "a", refresh_token: "r", user: { id: "u1" } };

function visit(path: string) {
  window.history.replaceState(null, "", path);
}

describe("readCallbackParams", () => {
  it("reads tokens from the hash or ?token and errors from either", () => {
    expect(readCallbackParams("https://x.dev/auth/callback#access_token=A&refresh_token=R")).toEqual({
      accessToken: "A",
      refreshToken: "R",
      error: null,
    });
    expect(readCallbackParams("https://x.dev/auth/callback?token=T").accessToken).toBe("T");
    expect(readCallbackParams("https://x.dev/auth/callback?token=T").refreshToken).toBeNull();
    expect(readCallbackParams("https://x.dev/cb?error=denied&error_description=Nope").error).toBe("Nope");
  });
});

describe("consumeAuthRedirect", () => {
  beforeEach(() => {
    resetAuthRedirectForTests();
    auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    auth.setSession.mockReset().mockResolvedValue({ data: { session: fakeSession }, error: null });
  });

  it("sets the session exactly once even when called concurrently", async () => {
    visit("/auth/callback?redirect_to=%2Feditor#access_token=A&refresh_token=R");
    const [a, b, c] = await Promise.all([consumeAuthRedirect(), consumeAuthRedirect(), consumeAuthRedirect()]);
    expect(auth.setSession).toHaveBeenCalledTimes(1);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "A", refresh_token: "R" });
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.session).toBe(fakeSession);
    // Tokens are scrubbed from the address bar, the post-login target is kept.
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?redirect_to=%2Feditor");
  });

  it("signs in with a token-only callback (non-refreshable session)", async () => {
    visit("/auth/callback?token=ONLY_ACCESS");
    const result = await consumeAuthRedirect();
    // supabase-js needs a non-empty refresh_token; the access token fills it.
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "ONLY_ACCESS", refresh_token: "ONLY_ACCESS" });
    expect(result.session).toBe(fakeSession);
    expect(result.error).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("uses the session Supabase already detected from the URL", async () => {
    auth.getSession.mockResolvedValue({ data: { session: fakeSession } });
    visit("/auth/callback#access_token=A&refresh_token=R&expires_in=3600&token_type=bearer");
    const result = await consumeAuthRedirect();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(result.session).toBe(fakeSession);
  });

  it("reports a rejected session instead of throwing", async () => {
    auth.setSession.mockResolvedValue({ data: { session: null }, error: { message: "Invalid Refresh Token" } });
    visit("/auth/callback#access_token=A&refresh_token=BAD");
    const result = await consumeAuthRedirect();
    expect(result.error).toEqual({ code: "session_rejected", message: "Invalid Refresh Token" });
  });

  it("surfaces gateway errors", async () => {
    visit("/auth/callback?error=access_denied&error_description=User%20cancelled");
    const result = await consumeAuthRedirect();
    expect(result.error).toEqual({ code: "provider_error", message: "User cancelled" });
  });

  it("does nothing on ordinary pages", async () => {
    visit("/dashboard");
    const result = await consumeAuthRedirect();
    expect(result).toEqual({ session: null, hadCallback: false, error: null });
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

describe("redirect paths", () => {
  it("keeps the full path and query through /login?redirect=", () => {
    const target = "/editor?project=a&x=b#main.py";
    const login = loginPathFor({ pathname: "/editor", search: "?project=a&x=b", hash: "#main.py" });
    const back = new URLSearchParams(login.split("?").slice(1).join("?")).get("redirect");
    expect(back).toBe(target);
    expect(safeRedirectPath(back)).toBe(target);
  });

  it("round-trips the return path through the SSO gateway URL", () => {
    const url = new URL(buildZuupLoginUrl("https://code.zuup.dev", "/editor?project=a&x=b"));
    expect(url.origin + url.pathname).toBe("https://auth.zuup.dev/login");
    const callback = new URL(url.searchParams.get("redirect_to")!);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("redirect_to")).toBe("/editor?project=a&x=b");
  });

  it("refuses off-site return paths", () => {
    const url = new URL(buildZuupLoginUrl("https://code.zuup.dev", "https://evil.example"));
    const callback = new URL(url.searchParams.get("redirect_to")!);
    expect(callback.searchParams.get("redirect_to")).toBe("/editor");
  });
});
