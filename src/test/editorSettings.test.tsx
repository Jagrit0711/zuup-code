import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_SETTINGS_STORAGE_KEY,
  getEditorSettings,
  resetEditorSettings,
  sanitizeSettings,
  updateEditorSettings,
  useEditorSettings,
} from "@/lib/editorSettings";
import { computeMinimalEdit } from "@/lib/editor/textDiff";

describe("sanitizeSettings", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(sanitizeSettings({ fontSize: "abc", wordWrap: "yes", tabSize: NaN })).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it("clamps numbers and rounds them", () => {
    expect(sanitizeSettings({ fontSize: 3 }).fontSize).toBe(10);
    expect(sanitizeSettings({ fontSize: 99 }).fontSize).toBe(32);
    expect(sanitizeSettings({ fontSize: 15.6 }).fontSize).toBe(16);
    expect(sanitizeSettings({ tabSize: 0 }).tabSize).toBe(1);
    expect(sanitizeSettings({ tabSize: 20 }).tabSize).toBe(8);
  });

  it("keeps valid booleans and drops unknown keys", () => {
    const s = sanitizeSettings({ wordWrap: true, minimap: false, extra: 1 });
    expect(s.wordWrap).toBe(true);
    expect(s.minimap).toBe(false);
    expect(s).not.toHaveProperty("extra");
  });

  it("exposes the documented defaults", () => {
    expect(DEFAULT_EDITOR_SETTINGS).toEqual({
      fontSize: 14,
      tabSize: 2,
      wordWrap: false,
      minimap: true,
      inlineSuggestions: true,
      autoComplete: true,
      formatOnPaste: true,
    });
  });
});

describe("editor settings store", () => {
  beforeEach(() => resetEditorSettings());
  afterEach(() => window.localStorage.removeItem(EDITOR_SETTINGS_STORAGE_KEY));

  it("persists updates to localStorage", () => {
    updateEditorSettings({ fontSize: 18, wordWrap: true });
    const stored = JSON.parse(window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY) as string);
    expect(stored.fontSize).toBe(18);
    expect(stored.wordWrap).toBe(true);
    expect(getEditorSettings().fontSize).toBe(18);
  });

  it("keeps every hook consumer in sync", () => {
    const a = renderHook(() => useEditorSettings());
    const b = renderHook(() => useEditorSettings());
    act(() => a.result.current.updateSettings({ tabSize: 4 }));
    expect(b.result.current.settings.tabSize).toBe(4);
    expect(a.result.current.settings.tabSize).toBe(4);
  });

  it("returns a stable snapshot when nothing changed", () => {
    const { result, rerender } = renderHook(() => useEditorSettings());
    const first = result.current.settings;
    rerender();
    act(() => result.current.updateSettings({ tabSize: DEFAULT_EDITOR_SETTINGS.tabSize }));
    expect(result.current.settings).toBe(first);
  });

  it("resets to defaults", () => {
    updateEditorSettings({ fontSize: 20, minimap: false });
    resetEditorSettings();
    expect(getEditorSettings()).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it("clamps zoom through the same path the editor uses", () => {
    updateEditorSettings({ fontSize: 500 });
    expect(getEditorSettings().fontSize).toBe(32);
    updateEditorSettings({ fontSize: -4 });
    expect(getEditorSettings().fontSize).toBe(10);
  });

  it("keeps stable function identities for consumers", () => {
    const { result, rerender } = renderHook(() => useEditorSettings());
    const { updateSettings, resetSettings } = result.current;
    rerender();
    expect(result.current.updateSettings).toBe(updateSettings);
    expect(result.current.resetSettings).toBe(resetSettings);
  });
});

describe("computeMinimalEdit", () => {
  const apply = (text: string, e: { start: number; end: number; text: string }) => text.slice(0, e.start) + e.text + text.slice(e.end);

  it("returns null for equal texts", () => {
    expect(computeMinimalEdit("abc", "abc")).toBeNull();
  });

  it("finds a single changed region", () => {
    const e = computeMinimalEdit("hello world", "hello brave world")!;
    expect(e).toEqual({ start: 6, end: 6, text: "brave " });
    expect(apply("hello world", e)).toBe("hello brave world");
  });

  it("handles deletions, replacements and full rewrites", () => {
    for (const [a, b] of [
      ["abcdef", "abef"],
      ["abcdef", "abXYef"],
      ["", "new"],
      ["old", ""],
      ["aaa", "aaaa"],
      ["line1\nline2\nline3", "line1\nLINE2\nline3"],
    ]) {
      const e = computeMinimalEdit(a, b)!;
      expect(apply(a, e)).toBe(b);
    }
  });

  it("does not let prefix and suffix overlap on repeated characters", () => {
    const e = computeMinimalEdit("aaa", "aa")!;
    expect(apply("aaa", e)).toBe("aa");
  });
});
