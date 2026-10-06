import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_SETTINGS_STORAGE_KEY,
  LEGACY_EDITOR_SETTINGS_STORAGE_KEYS,
  __resetEditorSettingsStoreForTests,
  changedFromDefaults,
  getEditorSettings,
  parseSettingsFile,
  replaceEditorSettings,
  serializeSettings,
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
      fontFamily: "jetbrains",
      ligatures: true,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: false,
      minimap: true,
      lineNumbers: "on",
      renderWhitespace: "selection",
      bracketPairColors: true,
      stickyScroll: true,
      cursorStyle: "line",
      cursorBlinking: "smooth",
      inlineSuggestions: true,
      autoComplete: true,
      formatOnPaste: true,
      autoSaveDelay: 3000,
      confirmBeforeLeave: true,
      saveBeforeRun: false,
      terminalFontSize: 13,
    });
  });

  it("rejects unknown enum values and snaps the auto-save delay", () => {
    const s = sanitizeSettings({ lineNumbers: "sometimes", cursorStyle: "block", fontFamily: "comic", autoSaveDelay: 2500 });
    expect(s.lineNumbers).toBe("on");
    expect(s.cursorStyle).toBe("block");
    expect(s.fontFamily).toBe("jetbrains");
    expect(s.autoSaveDelay).toBe(3000);
    expect(sanitizeSettings({ autoSaveDelay: 0 }).autoSaveDelay).toBe(0);
    expect(sanitizeSettings({ terminalFontSize: 99 }).terminalFontSize).toBe(24);
    expect(sanitizeSettings({ fontSize: null }).fontSize).toBe(14);
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

describe("settings migration", () => {
  const legacyKey = LEGACY_EDITOR_SETTINGS_STORAGE_KEYS[0];
  afterEach(() => {
    window.localStorage.removeItem(legacyKey);
    window.localStorage.removeItem(EDITOR_SETTINGS_STORAGE_KEY);
    __resetEditorSettingsStoreForTests();
  });

  it("moves v1 settings to the current key and fills new fields with defaults", () => {
    window.localStorage.removeItem(EDITOR_SETTINGS_STORAGE_KEY);
    window.localStorage.setItem(legacyKey, JSON.stringify({ fontSize: 18, tabSize: 4, minimap: false, inlineSuggestions: false }));
    __resetEditorSettingsStoreForTests();
    const s = getEditorSettings();
    expect(s.fontSize).toBe(18);
    expect(s.tabSize).toBe(4);
    expect(s.minimap).toBe(false);
    expect(s.inlineSuggestions).toBe(false);
    expect(s.stickyScroll).toBe(DEFAULT_EDITOR_SETTINGS.stickyScroll);
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY) as string).fontSize).toBe(18);
  });

  it("prefers the current key over the legacy one", () => {
    window.localStorage.setItem(legacyKey, JSON.stringify({ fontSize: 18 }));
    window.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify({ fontSize: 20 }));
    __resetEditorSettingsStoreForTests();
    expect(getEditorSettings().fontSize).toBe(20);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, "{not json");
    __resetEditorSettingsStoreForTests();
    expect(getEditorSettings()).toEqual(DEFAULT_EDITOR_SETTINGS);
  });
});

describe("settings export and import", () => {
  afterEach(() => {
    window.localStorage.removeItem(EDITOR_SETTINGS_STORAGE_KEY);
    resetEditorSettings();
  });

  it("round-trips through the export format", () => {
    const custom = { ...DEFAULT_EDITOR_SETTINGS, fontSize: 17, cursorStyle: "block" as const, wordWrap: true };
    const result = parseSettingsFile(serializeSettings(custom));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings).toEqual(custom);
  });

  it("accepts a bare settings object and reports unknown keys", () => {
    const result = parseSettingsFile(JSON.stringify({ fontSize: 12, theme: "light" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.fontSize).toBe(12);
      expect(result.ignored).toEqual(["theme"]);
    }
  });

  it("explains what is wrong with bad files", () => {
    expect(parseSettingsFile("nope")).toMatchObject({ ok: false });
    expect(parseSettingsFile("[1,2]")).toMatchObject({ ok: false });
    expect(parseSettingsFile(JSON.stringify({ kind: "something-else", settings: {} }))).toMatchObject({ ok: false });
    expect(parseSettingsFile(JSON.stringify({ hello: 1 }))).toMatchObject({ ok: false });
  });

  it("replaces every setting and lists changes from the defaults", () => {
    replaceEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, minimap: false, terminalFontSize: 15 });
    expect(getEditorSettings().minimap).toBe(false);
    expect(changedFromDefaults(getEditorSettings()).sort()).toEqual(["minimap", "terminalFontSize"]);
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
