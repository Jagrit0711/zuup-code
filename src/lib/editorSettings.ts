import { useCallback, useSyncExternalStore } from "react";

/**
 * Editor preferences shared by every call site (editor, status bar, terminal, settings
 * dialog). The store is module-level so all hook consumers stay in sync, it is
 * persisted to localStorage, and it is safe to import during server-side
 * rendering (no browser globals are touched until a client snapshot is read).
 */
export type EditorFontFamily = "jetbrains" | "system";
export type LineNumbersMode = "on" | "relative" | "off";
export type WhitespaceMode = "none" | "selection" | "boundary" | "all";
export type CursorStyle = "line" | "block" | "underline";
export type CursorBlinking = "blink" | "smooth" | "solid";

export interface EditorSettings {
  /** Editor font size in px (10-32). */
  fontSize: number;
  fontFamily: EditorFontFamily;
  /** Join character pairs like => and != into one glyph. */
  ligatures: boolean;
  /** Width of an indentation level in spaces. */
  tabSize: number;
  /** Tab inserts spaces instead of a tab character. */
  insertSpaces: boolean;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: LineNumbersMode;
  renderWhitespace: WhitespaceMode;
  bracketPairColors: boolean;
  /** Keep the enclosing function/class header pinned while scrolling. */
  stickyScroll: boolean;
  cursorStyle: CursorStyle;
  cursorBlinking: CursorBlinking;
  /** Ghost-text (inline) suggestions. */
  inlineSuggestions: boolean;
  /** Suggest widget while typing and on trigger characters. */
  autoComplete: boolean;
  formatOnPaste: boolean;
  /** Delay before a cloud project saves itself after a change, in ms. 0 turns auto-save off. */
  autoSaveDelay: number;
  /** Ask before leaving the page while changes are not saved anywhere yet. */
  confirmBeforeLeave: boolean;
  /** Save a cloud project before every run. */
  saveBeforeRun: boolean;
  /** Terminal output font size in px (10-24). */
  terminalFontSize: number;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = Object.freeze({
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
}) as EditorSettings;

/** Current storage key. v1 held a subset of these fields and is migrated on first read. */
export const EDITOR_SETTINGS_STORAGE_KEY = "zuup_editor_settings_v2";
export const LEGACY_EDITOR_SETTINGS_STORAGE_KEYS = ["zuup_editor_settings_v1"] as const;
export const SETTINGS_EXPORT_KIND = "zuup-code-settings";
export const SETTINGS_EXPORT_VERSION = 2;

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 32;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 24;
export const TAB_SIZE_OPTIONS = [2, 4, 8] as const;
export const AUTO_SAVE_DELAY_OPTIONS = [0, 1000, 3000, 10000] as const;

export const FONT_FAMILY_CSS: Record<EditorFontFamily, string> = {
  jetbrains: "'JetBrains Mono', ui-monospace, monospace",
  system: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
};

const LINE_NUMBERS: readonly LineNumbersMode[] = ["on", "relative", "off"];
const WHITESPACE: readonly WhitespaceMode[] = ["none", "selection", "boundary", "all"];
const CURSOR_STYLES: readonly CursorStyle[] = ["line", "block", "underline"];
const CURSOR_BLINKING: readonly CursorBlinking[] = ["blink", "smooth", "solid"];
const FONT_FAMILIES: readonly EditorFontFamily[] = ["jetbrains", "system"];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Snap an auto-save delay to the nearest offered option so the select always shows a value. */
function asDelay(value: unknown, fallback: number): number {
  const n = clampInt(value, 0, 60000, fallback);
  if (n === 0) return 0;
  return AUTO_SAVE_DELAY_OPTIONS.filter((o) => o > 0).reduce((best, o) => (Math.abs(o - n) < Math.abs(best - n) ? o : best), 1000);
}

/**
 * Merge an arbitrary (possibly corrupt or older) object over a base settings object,
 * clamping numbers and dropping values of the wrong type. Missing fields keep the base value,
 * which is how settings stored by older versions pick up new defaults.
 */
export function sanitizeSettings(
  input: unknown,
  base: EditorSettings = DEFAULT_EDITOR_SETTINGS,
): EditorSettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    fontSize: clampInt(src.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE, base.fontSize),
    fontFamily: asEnum(src.fontFamily, FONT_FAMILIES, base.fontFamily),
    ligatures: asBool(src.ligatures, base.ligatures),
    tabSize: clampInt(src.tabSize, 1, 8, base.tabSize),
    insertSpaces: asBool(src.insertSpaces, base.insertSpaces),
    wordWrap: asBool(src.wordWrap, base.wordWrap),
    minimap: asBool(src.minimap, base.minimap),
    lineNumbers: asEnum(src.lineNumbers, LINE_NUMBERS, base.lineNumbers),
    renderWhitespace: asEnum(src.renderWhitespace, WHITESPACE, base.renderWhitespace),
    bracketPairColors: asBool(src.bracketPairColors, base.bracketPairColors),
    stickyScroll: asBool(src.stickyScroll, base.stickyScroll),
    cursorStyle: asEnum(src.cursorStyle, CURSOR_STYLES, base.cursorStyle),
    cursorBlinking: asEnum(src.cursorBlinking, CURSOR_BLINKING, base.cursorBlinking),
    inlineSuggestions: asBool(src.inlineSuggestions, base.inlineSuggestions),
    autoComplete: asBool(src.autoComplete, base.autoComplete),
    formatOnPaste: asBool(src.formatOnPaste, base.formatOnPaste),
    autoSaveDelay: asDelay(src.autoSaveDelay, base.autoSaveDelay),
    confirmBeforeLeave: asBool(src.confirmBeforeLeave, base.confirmBeforeLeave),
    saveBeforeRun: asBool(src.saveBeforeRun, base.saveBeforeRun),
    terminalFontSize: clampInt(src.terminalFontSize, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE, base.terminalFontSize),
  };
}

const SETTING_KEYS = Object.keys(DEFAULT_EDITOR_SETTINGS) as (keyof EditorSettings)[];

export function sameSettings(a: EditorSettings, b: EditorSettings): boolean {
  return SETTING_KEYS.every((k) => a[k] === b[k]);
}

/** Keys whose value differs from the default, e.g. to show which rows were changed. */
export function changedFromDefaults(settings: EditorSettings): (keyof EditorSettings)[] {
  return SETTING_KEYS.filter((k) => settings[k] !== DEFAULT_EDITOR_SETTINGS[k]);
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export function serializeSettings(settings: EditorSettings): string {
  return JSON.stringify(
    { kind: SETTINGS_EXPORT_KIND, version: SETTINGS_EXPORT_VERSION, settings },
    null,
    2,
  );
}

export type ImportResult = { ok: true; settings: EditorSettings; ignored: string[] } | { ok: false; error: string };

/**
 * Parse a settings file made by `serializeSettings` (or a bare settings object). Unknown keys are
 * ignored and reported; invalid values fall back to the current settings.
 */
export function parseSettingsFile(text: string, base: EditorSettings = DEFAULT_EDITOR_SETTINGS): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON. Choose a settings file exported from Zuup Code." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "This file does not contain Zuup Code settings." };
  }
  const obj = data as Record<string, unknown>;
  const wrapped = obj.kind === SETTINGS_EXPORT_KIND;
  if ("kind" in obj && !wrapped) {
    return { ok: false, error: "This file does not contain Zuup Code settings." };
  }
  const raw = wrapped ? obj.settings : obj;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "This file does not contain Zuup Code settings." };
  }
  const keys = Object.keys(raw);
  const known = keys.filter((k) => (SETTING_KEYS as string[]).includes(k));
  if (known.length === 0) {
    return { ok: false, error: "No settings were found in this file." };
  }
  return {
    ok: true,
    settings: sanitizeSettings(raw, base),
    ignored: keys.filter((k) => !(SETTING_KEYS as string[]).includes(k)),
  };
}

// ---------------------------------------------------------------------------
// Shared store
// ---------------------------------------------------------------------------

let current: EditorSettings = DEFAULT_EDITOR_SETTINGS;
let hydrated = false;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

function readJson(key: string): unknown {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

/** Reads the current key, falling back to (and migrating) older keys. */
export function readStoredSettings(): EditorSettings {
  try {
    const stored = readJson(EDITOR_SETTINGS_STORAGE_KEY);
    if (stored) return sanitizeSettings(stored);
    for (const legacyKey of LEGACY_EDITOR_SETTINGS_STORAGE_KEYS) {
      const legacy = readJson(legacyKey);
      if (!legacy) continue;
      const migrated = sanitizeSettings(legacy);
      persist(migrated);
      try {
        window.localStorage.removeItem(legacyKey);
      } catch {
        // Keeping the old key is harmless.
      }
      return migrated;
    }
    return DEFAULT_EDITOR_SETTINGS;
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

function persist(next: EditorSettings) {
  try {
    window.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota); settings still apply for this session.
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function setCurrent(next: EditorSettings, save: boolean) {
  if (sameSettings(next, current)) return;
  current = next;
  if (save) persist(next);
  emit();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  current = readStoredSettings();
}

function attachStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== EDITOR_SETTINGS_STORAGE_KEY) return;
    setCurrent(readStoredSettings(), false);
  });
}

export function getEditorSettings(): EditorSettings {
  ensureHydrated();
  return current;
}

export function updateEditorSettings(patch: Partial<EditorSettings>) {
  ensureHydrated();
  setCurrent(sanitizeSettings({ ...current, ...patch }, current), true);
}

/** Replace every setting at once (import). Values are sanitized. */
export function replaceEditorSettings(next: EditorSettings) {
  ensureHydrated();
  setCurrent(sanitizeSettings(next, DEFAULT_EDITOR_SETTINGS), true);
}

export function resetEditorSettings() {
  ensureHydrated();
  setCurrent(DEFAULT_EDITOR_SETTINGS, true);
}

export function subscribeEditorSettings(listener: () => void): () => void {
  ensureHydrated();
  attachStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: forget the in-memory copy so the next read hydrates from storage again. */
export function __resetEditorSettingsStoreForTests() {
  hydrated = false;
  current = DEFAULT_EDITOR_SETTINGS;
}

const getServerSnapshot = () => DEFAULT_EDITOR_SETTINGS;

export function useEditorSettings(): {
  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;
  resetSettings: () => void;
} {
  const settings = useSyncExternalStore(subscribeEditorSettings, getEditorSettings, getServerSnapshot);
  const updateSettings = useCallback((patch: Partial<EditorSettings>) => updateEditorSettings(patch), []);
  const resetSettings = useCallback(() => resetEditorSettings(), []);
  return { settings, updateSettings, resetSettings };
}
