import type { Session } from "@supabase/supabase-js";
import { supabase, ZUUP_AUTH_GATEWAY_URL } from "@/lib/supabase";
import { safeRedirectPath } from "@/lib/safeRedirect";

/**
 * The Zuup SSO gateway sends people back with tokens in the URL (`#access_token=…&refresh_token=…`,
 * or `?token=…`). This module is the only place those tokens are read and handed to Supabase, and it
 * runs at most once per page load: React StrictMode, re-renders and the /auth/callback page all
 * share the same promise instead of racing each other with repeated `setSession` calls.
 */

export type AuthRedirectErrorCode = "provider_error" | "session_rejected";

export interface AuthRedirectResult {
  session: Session | null;
  /** True when the URL carried tokens or an error from the gateway. */
  hadCallback: boolean;
  error: { code: AuthRedirectErrorCode; message: string } | null;
}

interface CallbackParams {
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
}

export function readCallbackParams(href: string): CallbackParams {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const errorText =
    url.searchParams.get("error_description") ||
    hash.get("error_description") ||
    url.searchParams.get("error") ||
    hash.get("error");
  return {
    accessToken: hash.get("access_token") || url.searchParams.get("token"),
    refreshToken: hash.get("refresh_token") || url.searchParams.get("refresh_token"),
    error: errorText,
  };
}

const TOKEN_PARAMS = ["token", "refresh_token", "code", "error", "error_description", "error_code"];

/** Remove tokens from the address bar and history so they are not bookmarked or shared. */
function scrubUrl() {
  const clean = new URL(window.location.href);
  TOKEN_PARAMS.forEach((p) => clean.searchParams.delete(p));
  clean.hash = "";
  window.history.replaceState(window.history.state, document.title, clean.pathname + clean.search);
}

async function consume(): Promise<AuthRedirectResult> {
  const params = readCallbackParams(window.location.href);
  const hadCallback = Boolean(params.accessToken || params.error);

  // getSession() waits for the client's own initialisation, which already consumes a complete
  // Supabase-style hash (access + refresh token, expiry, token type). Only fall back to a manual
  // setSession when that did not produce a session.
  const { data: existing } = await supabase.auth.getSession();

  if (!hadCallback) return { session: existing.session, hadCallback, error: null };

  scrubUrl();

  if (params.error) {
    return { session: existing.session, hadCallback, error: { code: "provider_error", message: params.error } };
  }
  if (existing.session) return { session: existing.session, hadCallback, error: null };

  // Token-only sign-in (`?token=<access>` with no refresh token) is a path the Zuup SSO gateway
  // can use, so it must keep working. supabase-js insists on a non-empty refresh_token, so the
  // access token fills both fields. The result is a session that CANNOT refresh: it lasts until the
  // access token expires, then the refresh attempt fails, Supabase signs out once (SIGNED_OUT), and
  // AuthProvider shows a single "Your session expired" toast while ProtectedRoute sends the user to
  // /login (which never auto-redirects, so there is no loop).
  const refreshToken = params.refreshToken || params.accessToken!;

  const { data, error } = await supabase.auth.setSession({
    access_token: params.accessToken!,
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    return {
      session: null,
      hadCallback,
      error: {
        code: "session_rejected",
        message: error?.message || "Your sign-in could not be verified. Please sign in again.",
      },
    };
  }
  return { session: data.session, hadCallback, error: null };
}

let pending: Promise<AuthRedirectResult> | null = null;

/** Consume any SSO tokens in the current URL. Safe to call many times; the work happens once. */
export function consumeAuthRedirect(): Promise<AuthRedirectResult> {
  if (!pending) {
    pending = consume().catch((err: unknown) => ({
      session: null,
      hadCallback: true,
      error: {
        code: "session_rejected" as const,
        message: err instanceof Error && err.message ? err.message : "Sign-in failed. Please sign in again.",
      },
    }));
  }
  return pending;
}

/** Test hook: forget the memoised result. */
export function resetAuthRedirectForTests() {
  pending = null;
}

/** Gateway login URL that returns to /auth/callback, then to `returnUrl` (same-origin paths only). */
export function buildZuupLoginUrl(origin: string, returnUrl?: string): string {
  // Only same-origin paths: an absolute URL here would send the SSO tokens to another site.
  const cleanPath = safeRedirectPath(returnUrl);
  const destination = `${origin}/auth/callback?redirect_to=${encodeURIComponent(cleanPath)}`;
  const targetUrl = new URL(`${ZUUP_AUTH_GATEWAY_URL}/login`);
  targetUrl.searchParams.set("redirect_to", destination);
  return targetUrl.toString();
}

/** `/login?redirect=…` for the given location; the whole path, query and hash survive the trip. */
export function loginPathFor(location: { pathname: string; search?: string; hash?: string }): string {
  const target = location.pathname + (location.search ?? "") + (location.hash ?? "");
  return `/login?${new URLSearchParams({ redirect: target }).toString()}`;
}
