import { beforeEach, describe, expect, it } from "vitest";
import { markBooted, shouldReloadForChunkError } from "@/lib/bootRecovery";

describe("boot recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.__zuupBooted = false;
    window.history.replaceState(null, "", "/");
  });

  it("marks the app booted, clears the retry flag and strips the cache-busting query", () => {
    sessionStorage.setItem("zuup_boot_retry", "1");
    window.history.replaceState(null, "", "/editor?project=abc&_r=xyz#top");
    markBooted();
    expect(window.__zuupBooted).toBe(true);
    expect(sessionStorage.getItem("zuup_boot_retry")).toBeNull();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/editor?project=abc#top");
  });

  it("reloads for a chunk error at most once per minute", () => {
    expect(shouldReloadForChunkError(1_000_000, null)).toBe(true);
    expect(shouldReloadForChunkError(1_000_000, 990_000)).toBe(false);
    expect(shouldReloadForChunkError(1_000_000, 900_000)).toBe(true);
  });
});
