/**
 * Recovery for stale or half-deployed assets. Hashed file names change on every deploy, so a tab that
 * loaded the previous version can request chunks that no longer exist; the SPA fallback then answers
 * with index.html and the import fails. index.html has a matching guard for the entry script.
 */

const RETRY_KEY = "zuup_boot_retry";
const CHUNK_RELOAD_KEY = "zuup_chunk_reload_at";
/** Do not reload again within this window, so a genuinely broken deploy cannot loop. */
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

declare global {
  interface Window {
    __zuupBooted?: boolean;
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Call once the app has started: clears the entry-script retry flag and its cache-busting query. */
export function markBooted(): void {
  window.__zuupBooted = true;
  session()?.removeItem(RETRY_KEY);
  const url = new URL(window.location.href);
  if (url.searchParams.has("_r")) {
    url.searchParams.delete("_r");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
}

/** Decide whether a failed chunk load should reload the page. Exported for tests. */
export function shouldReloadForChunkError(now: number, lastReloadAt: number | null): boolean {
  return lastReloadAt === null || now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS;
}

/** Reload once when a lazily loaded chunk fails because a newer deploy replaced it. */
export function installChunkReloadGuard(): void {
  window.addEventListener("vite:preloadError", (event) => {
    const store = session();
    const raw = store?.getItem(CHUNK_RELOAD_KEY);
    const last = raw ? Number(raw) : null;
    const now = Date.now();
    if (!shouldReloadForChunkError(now, Number.isFinite(last) ? last : null)) return; // let the error surface
    event.preventDefault();
    store?.setItem(CHUNK_RELOAD_KEY, String(now));
    window.location.reload();
  });
}

/** A lazily loaded module that failed to download (usually replaced by a newer deploy). */
export function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically/i.test(
      error.message,
    )
  );
}
