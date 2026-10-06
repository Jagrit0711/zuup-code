import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  buildErrorLocation,
  buildSuccessLocation,
  decodeStateCookieValue,
  encodeStateCookieValue,
  generateState,
  handleCallback,
  handleConfig,
  handleLogin,
  mapOAuthError,
  parseCookies,
  resolveRedirectUri,
  sanitizeReturnPath,
  serializeCookie,
  timingSafeEqual,
  validateScope,
  type OAuthEnv,
} from "@/lib/github/oauthServer";
import { sendWebResponse, toWebRequest } from "@/lib/github/nodeAdapter";

const env: OAuthEnv = { GITHUB_CLIENT_ID: "client123", GITHUB_CLIENT_SECRET: "secret456" };
const ORIGIN = "https://code.zuup.dev";
const fixedRandom = (a: Uint8Array) => a.fill(0xab);

describe("sanitizeReturnPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(sanitizeReturnPath("/editor")).toBe("/editor");
    expect(sanitizeReturnPath("/editor?project=abc&x=1")).toBe("/editor?project=abc&x=1");
    expect(sanitizeReturnPath("/")).toBe("/");
    expect(sanitizeReturnPath("/dashboard/projects")).toBe("/dashboard/projects");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash host", "/\\evil.com"],
    ["backslash anywhere", "/a\\b"],
    ["absolute http", "http://evil.com"],
    ["absolute https", "https://evil.com/editor"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no leading slash", "editor"],
    ["empty", ""],
    ["control char", "/a\nb"],
    ["tab", "/a\tb"],
    ["space", "/a b"],
    ["fragment", "/editor#x"],
    ["encoded double slash", "/%2F/evil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["scheme in path", "/https://evil.com"],
    ["too long", "/" + "a".repeat(600)],
  ])("rejects %s", (_name, input) => {
    expect(sanitizeReturnPath(input)).toBe("/editor");
  });

  it("falls back for null, undefined and custom fallbacks", () => {
    expect(sanitizeReturnPath(null)).toBe("/editor");
    expect(sanitizeReturnPath(undefined, "/home")).toBe("/home");
  });
});

describe("scope, state and comparison helpers", () => {
  it("allow-lists scopes", () => {
    expect(validateScope("public_repo")).toBe("public_repo");
    expect(validateScope("repo")).toBe("repo");
    expect(validateScope(null)).toBe("public_repo");
    expect(validateScope("")).toBe("public_repo");
    expect(validateScope("admin:org")).toBeNull();
    expect(validateScope("repo,delete_repo")).toBeNull();
    expect(validateScope("REPO")).toBeNull();
  });

  it("generates 48-hex-char random state and uses the supplied RNG", () => {
    expect(generateState(fixedRandom)).toBe("ab".repeat(24));
    const a = generateState();
    const b = generateState();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });

  it("compares in constant time over equal and unequal lengths", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("round-trips the cookie value and re-sanitises the return path", () => {
    const state = "a1".repeat(24);
    const value = encodeStateCookieValue(state, "/editor?p=a b&q=1");
    expect(value).not.toMatch(/[;,\s]/);
    expect(decodeStateCookieValue(value)).toEqual({ state, returnPath: "/editor" }); // space is rejected
    expect(decodeStateCookieValue(encodeStateCookieValue(state, "/editor?p=1"))).toEqual({ state, returnPath: "/editor?p=1" });
    expect(decodeStateCookieValue(`${state}.${encodeURIComponent("//evil.com")}`)?.returnPath).toBe("/editor");
    expect(decodeStateCookieValue(undefined)).toBeNull();
    expect(decodeStateCookieValue("nodot")).toBeNull();
    expect(decodeStateCookieValue("zz.%2Feditor")).toBeNull();
    expect(decodeStateCookieValue(`${state}.%E0%A4%A`)).toBeNull();
  });

  it("serializes hardened cookies", () => {
    expect(serializeCookie("n", "v", { maxAge: 600, secure: true })).toBe("n=v; Path=/api/github; Max-Age=600; HttpOnly; SameSite=Lax; Secure");
    expect(serializeCookie("n", "", { maxAge: 0, secure: false })).toBe("n=; Path=/api/github; Max-Age=0; HttpOnly; SameSite=Lax");
  });

  it("parses cookie headers", () => {
    expect(parseCookies("a=1; zuup_gh_oauth=abc.def; b=x=y")).toEqual({ a: "1", zuup_gh_oauth: "abc.def", b: "x=y" });
    expect(parseCookies(null)).toEqual({});
  });
});

describe("URL building and error mapping", () => {
  it("builds the authorize URL", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "c", redirectUri: `${ORIGIN}/api/github/callback`, scope: "repo", state: "st" }));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "c",
      redirect_uri: `${ORIGIN}/api/github/callback`,
      scope: "repo",
      state: "st",
      allow_signup: "true",
    });
  });

  it("resolves the redirect URI from env or the request origin", () => {
    expect(resolveRedirectUri(env, "https://code.zuup.dev/api/github/login?x=1")).toBe("https://code.zuup.dev/api/github/callback");
    expect(resolveRedirectUri({ ...env, GITHUB_OAUTH_REDIRECT_URI: "https://x.example/cb" }, ORIGIN)).toBe("https://x.example/cb");
    expect(resolveRedirectUri(env, "http://localhost:8080/api/github/login")).toBe("http://localhost:8080/api/github/callback");
  });

  it("puts the token in the fragment, never the query", () => {
    const location = buildSuccessLocation("/editor?p=1", "gho_x", "repo,user");
    expect(location).toBe("/editor?p=1#gh_token=gho_x&gh_scope=repo%2Cuser");
    expect(location.split("#")[0]).not.toContain("gho_x");
    expect(buildErrorLocation("/editor", "access_denied")).toBe("/editor#gh_error=access_denied");
  });

  it("maps GitHub OAuth errors", () => {
    expect(mapOAuthError("access_denied")).toBe("access_denied");
    expect(mapOAuthError("bad_verification_code")).toBe("invalid_code");
    expect(mapOAuthError("redirect_uri_mismatch")).toBe("redirect_uri_mismatch");
    expect(mapOAuthError("incorrect_client_credentials")).toBe("not_configured");
    expect(mapOAuthError("something_new")).toBe("oauth_failed");
    expect(mapOAuthError(null)).toBe("oauth_failed");
  });
});

describe("handleConfig", () => {
  it("reports whether OAuth is configured and nothing else", async () => {
    const res = handleConfig(new Request(`${ORIGIN}/api/github/config`), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ oauthConfigured: true });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await handleConfig(new Request(`${ORIGIN}/api/github/config`), {}).json()).toEqual({ oauthConfigured: false });
    expect(await handleConfig(new Request(`${ORIGIN}/api/github/config`), { GITHUB_CLIENT_ID: "x" }).json()).toEqual({ oauthConfigured: false });
  });

  it("rejects other methods", () => {
    expect(handleConfig(new Request(`${ORIGIN}/api/github/config`, { method: "POST" }), env).status).toBe(405);
  });
});

describe("handleLogin", () => {
  it("answers 501 JSON when unconfigured", async () => {
    const res = handleLogin(new Request(`${ORIGIN}/api/github/login`), {});
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: "github_oauth_not_configured" });
  });

  it("rejects scopes outside the allow-list", async () => {
    const res = handleLogin(new Request(`${ORIGIN}/api/github/login?scope=delete_repo`), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_scope");
  });

  it("sets an HttpOnly state cookie and redirects to GitHub", () => {
    const res = handleLogin(new Request(`${ORIGIN}/api/github/login?scope=repo&return=/editor%3Fp%3D1`), env, fixedRandom);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") as string);
    expect(location.hostname).toBe("github.com");
    expect(location.searchParams.get("client_id")).toBe("client123");
    expect(location.searchParams.get("scope")).toBe("repo");
    expect(location.searchParams.get("state")).toBe("ab".repeat(24));
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/github/callback`);
    expect(location.search).not.toContain("secret456");
    const cookie = res.headers.get("set-cookie") as string;
    expect(cookie).toContain(`zuup_gh_oauth=${"ab".repeat(24)}.`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/github/);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(decodeStateCookieValue(cookie.split(";")[0].split("=").slice(1).join("="))?.returnPath).toBe("/editor?p=1");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("defaults the scope and neutralises a hostile return path", () => {
    const res = handleLogin(new Request(`${ORIGIN}/api/github/login?return=//evil.com`), env, fixedRandom);
    expect(new URL(res.headers.get("location") as string).searchParams.get("scope")).toBe("public_repo");
    expect(res.headers.get("set-cookie")).toContain(encodeURIComponent("/editor"));
  });

  it("omits Secure on plain-http localhost so dev sign-in works", () => {
    const res = handleLogin(new Request("http://localhost:8080/api/github/login"), env, fixedRandom);
    expect(res.headers.get("set-cookie")).not.toMatch(/Secure/);
    expect(new URL(res.headers.get("location") as string).searchParams.get("redirect_uri")).toBe("http://localhost:8080/api/github/callback");
  });
});

describe("handleCallback", () => {
  const state = "cd".repeat(24);
  const cookieHeader = (path = "/editor?p=1") => `zuup_gh_oauth=${encodeStateCookieValue(state, path)}`;
  const callbackRequest = (query: string, cookie: string | null = cookieHeader()) =>
    new Request(`${ORIGIN}/api/github/callback?${query}`, { headers: cookie ? { cookie } : {} });
  const okFetch = vi.fn(async () => new Response(JSON.stringify({ access_token: "gho_tok", scope: "repo", token_type: "bearer" }), { status: 200 }));

  it("answers 501 JSON when unconfigured", async () => {
    const res = await handleCallback(callbackRequest(`code=c&state=${state}`), {});
    expect(res.status).toBe(501);
  });

  it("exchanges the code and hands the token over in the fragment", async () => {
    okFetch.mockClear();
    const res = await handleCallback(callbackRequest(`code=thecode&state=${state}`), env, okFetch as unknown as typeof fetch);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/editor?p=1#gh_token=gho_tok&gh_scope=repo`);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const [url, init] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: "client123",
      client_secret: "secret456",
      code: "thecode",
      redirect_uri: `${ORIGIN}/api/github/callback`,
    });
  });

  it("rejects a state that does not match the cookie, without calling GitHub", async () => {
    const fetchSpy = vi.fn();
    const res = await handleCallback(callbackRequest(`code=c&state=${"00".repeat(24)}`), env, fetchSpy as unknown as typeof fetch);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/editor?p=1#gh_error=state_mismatch`);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing cookie or missing state", async () => {
    const fetchSpy = vi.fn();
    const noCookie = await handleCallback(callbackRequest(`code=c&state=${state}`, null), env, fetchSpy as unknown as typeof fetch);
    expect(noCookie.headers.get("location")).toBe(`${ORIGIN}/editor#gh_error=state_mismatch`);
    const noState = await handleCallback(callbackRequest("code=c"), env, fetchSpy as unknown as typeof fetch);
    expect(noState.headers.get("location")).toContain("gh_error=state_mismatch");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps user cancellation and GitHub errors", async () => {
    const denied = await handleCallback(callbackRequest(`error=access_denied&state=${state}`), env, okFetch as unknown as typeof fetch);
    expect(denied.headers.get("location")).toContain("gh_error=access_denied");
    const badCode = await handleCallback(
      callbackRequest(`code=c&state=${state}`),
      env,
      (async () => new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 })) as typeof fetch,
    );
    expect(badCode.headers.get("location")).toContain("gh_error=invalid_code");
    const missingCode = await handleCallback(callbackRequest(`state=${state}`), env, okFetch as unknown as typeof fetch);
    expect(missingCode.headers.get("location")).toContain("gh_error=oauth_failed");
  });

  it("handles exchange network failures and malformed responses", async () => {
    const down = await handleCallback(
      callbackRequest(`code=c&state=${state}`),
      env,
      (async () => {
        throw new Error("boom");
      }) as typeof fetch,
    );
    expect(down.headers.get("location")).toContain("gh_error=exchange_failed");
    const empty = await handleCallback(callbackRequest(`code=c&state=${state}`), env, (async () => new Response("{}", { status: 200 })) as typeof fetch);
    expect(empty.headers.get("location")).toContain("gh_error=exchange_failed");
    const html = await handleCallback(callbackRequest(`code=c&state=${state}`), env, (async () => new Response("<html>", { status: 502 })) as typeof fetch);
    expect(html.headers.get("location")).toContain("gh_error=exchange_failed");
  });

  it("never leaks the client secret or token outside the fragment", async () => {
    const res = await handleCallback(callbackRequest(`code=c&state=${state}`), env, okFetch as unknown as typeof fetch);
    const location = res.headers.get("location") as string;
    expect(location.split("#")[0]).not.toContain("gho_tok");
    expect(location).not.toContain("secret456");
  });

  it("uses an explicit redirect URI override on both legs", async () => {
    okFetch.mockClear();
    await handleCallback(callbackRequest(`code=c&state=${state}`), { ...env, GITHUB_OAUTH_REDIRECT_URI: "https://custom.example/cb" }, okFetch as unknown as typeof fetch);
    const init = (okFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).redirect_uri).toBe("https://custom.example/cb");
  });
});

describe("node adapter (Vercel)", () => {
  it("converts a Node request into a Web Request using forwarded headers", () => {
    const req = toWebRequest({
      method: "GET",
      url: "/api/github/login?scope=repo",
      headers: { host: "internal:3000", "x-forwarded-host": "code.zuup.dev", "x-forwarded-proto": "https", cookie: "a=1" },
    });
    expect(req.url).toBe("https://code.zuup.dev/api/github/login?scope=repo");
    expect(req.headers.get("cookie")).toBe("a=1");
  });

  it("writes status, headers and body, keeping Set-Cookie intact", async () => {
    const headers: Record<string, string | string[]> = {};
    let body = "";
    const res = { statusCode: 0, setHeader: (k: string, v: string | string[]) => void (headers[k] = v), end: (b?: string) => void (body = b ?? "") };
    const response = handleLogin(new Request(`${ORIGIN}/api/github/login`), env, fixedRandom);
    await sendWebResponse(res, response);
    expect(res.statusCode).toBe(302);
    expect(String(headers.location ?? headers.Location)).toContain("github.com");
    expect(Array.isArray(headers["Set-Cookie"])).toBe(true);
    expect(body).toBe("");
  });
});
