/**
 * Platform-neutral GitHub OAuth server logic (Web Request/Response only), shared by the
 * Cloudflare Pages Functions in functions/api/github and the Vercel handlers in api/github.
 *
 * Flow: /login (state cookie + redirect to GitHub) -> GitHub -> /callback (verify state,
 * exchange code, redirect back with the token in the URL FRAGMENT so it never reaches a server log).
 * Do not import this file from browser code.
 * Keep it self-contained (no relative imports): the Vercel entry points load it as native Node ESM,
 * where extensionless relative imports fail with ERR_MODULE_NOT_FOUND.
 */

export interface OAuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_OAUTH_REDIRECT_URI?: string;
}

export const ALLOWED_SCOPES = ["public_repo", "repo"] as const;
export type AllowedScope = (typeof ALLOWED_SCOPES)[number];

export const STATE_COOKIE_NAME = "zuup_gh_oauth";
export const COOKIE_PATH = "/api/github";
export const STATE_COOKIE_MAX_AGE = 600;
export const DEFAULT_RETURN_PATH = "/editor";
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

// ------------------------------------------------------------- pure helpers

/** Allows only a same-origin relative path ("/x?y"). Anything else falls back to /editor. */
export function sanitizeReturnPath(input: string | null | undefined, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return fallback;
  if (input[0] !== "/" || input[1] === "/" || input[1] === "\\") return fallback;
  if (input.includes("\\")) return fallback;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return fallback; // control characters, spaces, tabs, newlines
  }
  // Never hand the token to a path that is itself part of the OAuth endpoints or carries a fragment.
  if (input.includes("#")) return fallback;
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || /^\/[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;
  return input;
}

export function validateScope(scope: string | null | undefined): AllowedScope | null {
  if (scope === null || scope === undefined || scope === "") return "public_repo";
  return (ALLOWED_SCOPES as readonly string[]).includes(scope) ? (scope as AllowedScope) : null;
}

export function generateState(getRandomValues: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const bytes = getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (does not short-circuit on the first differing character). */
export function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function resolveRedirectUri(env: OAuthEnv, requestUrl: string): string {
  const override = env.GITHUB_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;
  return `${new URL(requestUrl).origin}/api/github/callback`;
}

export function buildAuthorizeUrl(input: { clientId: string; redirectUri: string; scope: AllowedScope; state: string }): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

export function encodeStateCookieValue(state: string, returnPath: string): string {
  return `${state}.${encodeURIComponent(returnPath)}`;
}

export function decodeStateCookieValue(value: string | undefined): { state: string; returnPath: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const state = value.slice(0, dot);
  if (!/^[0-9a-f]{16,128}$/.test(state)) return null;
  let returnPath: string;
  try {
    returnPath = decodeURIComponent(value.slice(dot + 1));
  } catch {
    return null;
  }
  return { state, returnPath: sanitizeReturnPath(returnPath) };
}

export function serializeCookie(name: string, value: string, options: { maxAge: number; secure: boolean }): string {
  const parts = [`${name}=${value}`, `Path=${COOKIE_PATH}`, `Max-Age=${options.maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Maps a GitHub OAuth `error` to the short code the client understands. */
export function mapOAuthError(error: string | null | undefined): string {
  switch (error) {
    case "access_denied":
      return "access_denied";
    case "bad_verification_code":
      return "invalid_code";
    case "redirect_uri_mismatch":
      return "redirect_uri_mismatch";
    case "incorrect_client_credentials":
    case "unauthorized_client":
      return "not_configured";
    default:
      return "oauth_failed";
  }
}

export function buildSuccessLocation(returnPath: string, token: string, scope: string): string {
  const params = new URLSearchParams();
  params.set("gh_token", token);
  params.set("gh_scope", scope);
  return `${returnPath}#${params.toString()}`;
}

export function buildErrorLocation(returnPath: string, code: string): string {
  return `${returnPath}#${new URLSearchParams({ gh_error: code }).toString()}`;
}

// ------------------------------------------------------------------ handlers

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE, ...extra },
  });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, ...NO_STORE });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function isConfigured(env: OAuthEnv): boolean {
  return Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim());
}

function methodNotAllowed(): Response {
  return json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
}

function isSecure(requestUrl: string): boolean {
  return new URL(requestUrl).protocol === "https:";
}

export function handleConfig(request: Request, env: OAuthEnv): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  return json({ oauthConfigured: isConfigured(env) });
}

export function handleLogin(request: Request, env: OAuthEnv, getRandomValues?: (a: Uint8Array) => Uint8Array): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  if (!isConfigured(env)) return json({ error: "github_oauth_not_configured" }, 501);

  const url = new URL(request.url);
  const scope = validateScope(url.searchParams.get("scope"));
  if (!scope) return json({ error: "invalid_scope", allowed: ALLOWED_SCOPES }, 400);
  const returnPath = sanitizeReturnPath(url.searchParams.get("return"));
  const state = generateState(getRandomValues);

  const location = buildAuthorizeUrl({
    clientId: env.GITHUB_CLIENT_ID as string,
    redirectUri: resolveRedirectUri(env, request.url),
    scope,
    state,
  });
  const cookie = serializeCookie(STATE_COOKIE_NAME, encodeStateCookieValue(state, returnPath), {
    maxAge: STATE_COOKIE_MAX_AGE,
    secure: isSecure(request.url),
  });
  return redirect(location, cookie);
}

export async function handleCallback(
  request: Request,
  env: OAuthEnv,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  if (!isConfigured(env)) return json({ error: "github_oauth_not_configured" }, 501);

  const url = new URL(request.url);
  const secure = isSecure(request.url);
  const clearCookie = serializeCookie(STATE_COOKIE_NAME, "", { maxAge: 0, secure });
  const stored = decodeStateCookieValue(parseCookies(request.headers.get("cookie"))[STATE_COOKIE_NAME]);
  const returnPath = stored?.returnPath ?? DEFAULT_RETURN_PATH;
  const fail = (code: string) => redirect(origin(url) + buildErrorLocation(returnPath, code), clearCookie);

  const returnedState = url.searchParams.get("state") ?? "";
  if (!stored || !returnedState || !timingSafeEqual(stored.state, returnedState)) return fail("state_mismatch");

  const githubError = url.searchParams.get("error");
  if (githubError) return fail(mapOAuthError(githubError));
  const code = url.searchParams.get("code");
  if (!code) return fail("oauth_failed");

  let payload: { access_token?: string; scope?: string; error?: string };
  try {
    const res = await fetchImpl(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "zuup-code" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: resolveRedirectUri(env, request.url),
      }),
    });
    payload = (await res.json()) as typeof payload;
  } catch {
    return fail("exchange_failed");
  }
  if (payload.error) return fail(mapOAuthError(payload.error));
  if (!payload.access_token || typeof payload.access_token !== "string") return fail("exchange_failed");

  return redirect(origin(url) + buildSuccessLocation(returnPath, payload.access_token, payload.scope ?? ""), clearCookie);
}

function origin(url: URL): string {
  return url.origin;
}
