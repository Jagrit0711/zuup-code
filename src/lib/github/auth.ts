/**
 * GitHub authentication for the browser: token storage, validation, OAuth hand-off.
 *
 * The token is only ever sent to api.github.com and to this site's own /api/github/*
 * endpoints. It is never logged. All storage access is wrapped in try/catch and every
 * function is safe to import during server-side rendering (nothing runs at module scope).
 */
import { GitHubAuthError, GitHubNetworkError } from "./errors";

export const AUTH_STORAGE_KEY = "zuup_github_auth_v1";
export const OAUTH_SCOPES = ["public_repo", "repo"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export type TokenKind = "oauth" | "classic" | "fine-grained";

export interface GitHubAuth {
  token: string;
  /** Granted scopes from x-oauth-scopes. Empty for fine-grained tokens (they use permissions instead). */
  scopes: string[];
  login: string | null;
  avatar: string | null;
  kind: TokenKind;
  savedAt: number;
}

export interface GitHubViewer {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  scopes: string[];
}

type AuthListener = (auth: GitHubAuth | null) => void;
const listeners = new Set<AuthListener>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function notify(auth: GitHubAuth | null): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(auth);
    } catch {
      // a faulty listener must not break the others
    }
  }
}

export function inferTokenKind(token: string, viaOAuth = false): TokenKind {
  if (token.startsWith("github_pat_")) return "fine-grained";
  return viaOAuth ? "oauth" : "classic";
}

export function getAuth(): GitHubAuth | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GitHubAuth>;
    if (!data || typeof data.token !== "string" || !data.token) return null;
    return {
      token: data.token,
      scopes: Array.isArray(data.scopes) ? data.scopes.filter((s) => typeof s === "string") : [],
      login: typeof data.login === "string" ? data.login : null,
      avatar: typeof data.avatar === "string" ? data.avatar : null,
      kind: data.kind === "oauth" || data.kind === "fine-grained" ? data.kind : "classic",
      savedAt: typeof data.savedAt === "number" ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function setAuth(input: Omit<GitHubAuth, "savedAt" | "kind"> & { kind?: TokenKind; savedAt?: number }): GitHubAuth {
  const auth: GitHubAuth = {
    token: input.token,
    scopes: input.scopes,
    login: input.login,
    avatar: input.avatar,
    kind: input.kind ?? inferTokenKind(input.token),
    savedAt: input.savedAt ?? Date.now(),
  };
  try {
    storage()?.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // storage unavailable: the caller still gets the auth object for this session
  }
  notify(auth);
  return auth;
}

export function clearAuth(): void {
  try {
    storage()?.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  notify(null);
}

/** Subscribes to sign-in/sign-out, including changes made in other tabs. Returns an unsubscribe function. */
export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  let onStorage: ((e: StorageEvent) => void) | null = null;
  if (typeof window !== "undefined") {
    onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY || e.key === null) listener(getAuth());
    };
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (onStorage && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function parseScopes(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Can this auth push to a repository? Fine-grained tokens cannot be introspected, so they are assumed to. */
export function canWriteRepo(auth: Pick<GitHubAuth, "scopes" | "kind">, isPrivate: boolean): boolean {
  if (auth.kind === "fine-grained") return true;
  if (auth.scopes.includes("repo")) return true;
  return !isPrivate && auth.scopes.includes("public_repo");
}

/**
 * Validates a token with GET /user and returns who it belongs to plus its scopes.
 * Throws GitHubAuthError for a rejected token and GitHubNetworkError when GitHub is unreachable.
 */
export async function validateToken(
  token: string,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<GitHubViewer> {
  const trimmed = token.trim();
  if (!trimmed) throw new GitHubAuthError("Paste a GitHub token first.");
  let res: Response;
  try {
    res = await fetchImpl("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
  } catch {
    throw new GitHubNetworkError();
  }
  if (res.status === 401 || res.status === 403) {
    throw new GitHubAuthError("GitHub rejected this token. It may be mistyped, expired or revoked.", res.status);
  }
  if (!res.ok) throw new GitHubNetworkError(`GitHub returned an unexpected response (${res.status}).`);
  const data = (await res.json()) as { login?: string; name?: string | null; avatar_url?: string | null };
  if (!data || typeof data.login !== "string") {
    throw new GitHubAuthError("GitHub did not return an account for this token.");
  }
  return {
    login: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url ?? null,
    scopes: parseScopes(res.headers.get("x-oauth-scopes")),
  };
}

/** Personal-access-token fallback: validates, then stores. Nothing is stored if validation fails. */
export async function signInWithToken(
  token: string,
  fetchImpl?: typeof fetch,
  viaOAuth = false,
): Promise<GitHubAuth> {
  const trimmed = token.trim();
  const viewer = await validateToken(trimmed, fetchImpl);
  return setAuth({
    token: trimmed,
    scopes: viewer.scopes,
    login: viewer.login,
    avatar: viewer.avatarUrl,
    kind: inferTokenKind(trimmed, viaOAuth),
  });
}

// ------------------------------------------------------------------ OAuth

/** Builds the same-origin login URL the browser is sent to. */
export function buildLoginUrl(options: { scope?: OAuthScope; returnTo: string }): string {
  const params = new URLSearchParams();
  params.set("scope", options.scope ?? "public_repo");
  params.set("return", options.returnTo);
  return `/api/github/login?${params.toString()}`;
}

/** Path + query of the current page, without the hash. Safe fallback "/editor" during SSR. */
export function currentReturnPath(): string {
  if (typeof window === "undefined") return "/editor";
  return `${window.location.pathname}${window.location.search}` || "/editor";
}

/** Starts the OAuth flow with a full-page redirect. The page comes back with #gh_token=... */
export function startOAuth(options: { scope?: OAuthScope; returnTo?: string } = {}): void {
  if (typeof window === "undefined") return;
  window.location.assign(
    buildLoginUrl({ scope: options.scope, returnTo: options.returnTo ?? currentReturnPath() }),
  );
}

export type OAuthFragmentResult =
  | { type: "token"; token: string; scopes: string[] }
  | { type: "error"; error: string };

/**
 * Extracts the OAuth hand-off from a URL fragment. Returns null when the fragment
 * is not an OAuth result. Call scrubOAuthFragment() afterwards so the token does not
 * stay in the address bar or history.
 */
export function parseOAuthFragment(hash?: string): OAuthFragmentResult | null {
  const raw = hash ?? (typeof window === "undefined" ? "" : window.location.hash);
  if (!raw || raw.length < 2) return null;
  const params = new URLSearchParams(raw.startsWith("#") ? raw.slice(1) : raw);
  const error = params.get("gh_error");
  if (error) return { type: "error", error };
  const token = params.get("gh_token");
  if (!token) return null;
  return { type: "token", token, scopes: parseScopes(params.get("gh_scope")) };
}

/** Removes the hash from the address bar without adding a history entry. */
export function scrubOAuthFragment(): void {
  if (typeof window === "undefined") return;
  try {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  } catch {
    // ignore
  }
}

export type OAuthCompletion =
  | { type: "signed-in"; auth: GitHubAuth }
  | { type: "error"; error: string; message: string };

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "GitHub access was cancelled.",
  state_mismatch: "The sign-in request expired or did not match. Please try again.",
  invalid_code: "GitHub rejected the sign-in code. Please try again.",
  exchange_failed: "Could not complete the sign-in with GitHub. Please try again.",
  oauth_failed: "GitHub sign-in failed. Please try again.",
  redirect_uri_mismatch: "GitHub sign-in is misconfigured (callback URL mismatch).",
  not_configured: "GitHub sign-in is not configured on this site.",
};

export function describeOAuthError(code: string): string {
  return OAUTH_ERROR_MESSAGES[code] ?? "GitHub sign-in failed. Please try again.";
}

/**
 * One-call completion for the page the OAuth redirect lands on: parses the fragment,
 * scrubs it from the URL, validates and stores the token. Returns null if the URL has no OAuth result.
 */
export async function completeOAuthRedirect(fetchImpl?: typeof fetch): Promise<OAuthCompletion | null> {
  const result = parseOAuthFragment();
  if (!result) return null;
  scrubOAuthFragment();
  if (result.type === "error") {
    return { type: "error", error: result.error, message: describeOAuthError(result.error) };
  }
  try {
    const auth = await signInWithToken(result.token, fetchImpl, true);
    return { type: "signed-in", auth };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub sign-in failed.";
    return { type: "error", error: "invalid_token", message };
  }
}

/** Feature detection: is the OAuth App configured on this deployment? Any failure means "no". */
export async function detectOAuthConfigured(
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<boolean> {
  try {
    const res = await fetchImpl("/api/github/config", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { oauthConfigured?: unknown };
    return data?.oauthConfigured === true;
  } catch {
    return false;
  }
}
