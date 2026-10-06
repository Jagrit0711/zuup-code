import type { Monaco } from "@monaco-editor/react";

let pending: Promise<Monaco> | null = null;

/**
 * Load and configure Monaco on demand. The heavy bundle is a separate chunk,
 * fetched the first time an editor mounts (or earlier via a prefetch call).
 */
export function loadMonaco(): Promise<Monaco> {
  if (typeof window === "undefined") return Promise.reject(new Error("Monaco is only available in the browser"));
  if (!pending) {
    pending = import("./monacoSetup").then((m) => m.setupMonaco());
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
