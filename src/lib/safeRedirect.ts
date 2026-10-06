/**
 * Post-login redirect targets come from the URL (`/login?redirect=...`), so anyone can craft one.
 * Only same-origin paths are honoured; anything else (absolute URLs, protocol-relative `//host`,
 * backslash tricks, control characters) falls back to `fallback`.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/editor"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    // A path that resolves to another origin (e.g. via encoded tricks) is rejected too.
    const base = "https://zuup.invalid";
    if (new URL(raw, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
