import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safeRedirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeRedirectPath("/editor?project=abc#x")).toBe("/editor?project=abc#x");
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("falls back for missing values", () => {
    expect(safeRedirectPath(null)).toBe("/editor");
    expect(safeRedirectPath("", "/home")).toBe("/home");
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "/\\/evil.example",
    "javascript:alert(1)",
    "editor",
    "/ed\nitor",
    "/a\\b",
  ])("rejects %s", (raw) => {
    expect(safeRedirectPath(raw)).toBe("/editor");
  });
});
