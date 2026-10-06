import { useCallback, useSyncExternalStore } from "react";

/**
 * Editor preferences shared by every call site (editor, status bar, settings
 * modal). The store is module-level so all hook consumers stay in sync, it is
 * persisted to localStorage, and it is safe to import during server-side
 * rendering (no browser globals are touched until a client snapshot is read).
 */
export interface EditorSettings {
  /** Editor font size in px (10-32). */
  fontSize: number;
  /** Width of an indentation level in spaces. */
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  /** Ghost-text (inline) suggestions. */
  inlineSuggestions: boolean;
  /** Suggest widget while typing and on trigger characters. */
  autoComplete: boolean;
  formatOnPaste: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = Object.freeze({
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  minimap: true,
  inlineSuggestions: true,
  autoComplete: true,
  formatOnPaste: true,
}) as EditorSettings;

export const EDITOR_SETTINGS_STORAGE_KEY = "zuup_editor_settings_v1";
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 32;
export const TAB_SIZE_OPTIONS = [2, 4, 8] as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Merge an arbitrary (possibly corrupt) object over a base settings object,
 * clamping numbers and dropping values of the wrong type.
 */
export function sanitizeSettings(
  input: unknown,
  base: EditorSettings = DEFAULT_EDITOR_SETTINGS,
): EditorSettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    fontSize: clampInt(src.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE, base.fontSize),
    tabSize: clampInt(src.tabSize, 1, 8, base.tabSize),
    wordWrap: asBool(src.wordWrap, base.wordWrap),
    minimap: asBool(src.minimap, base.minimap),
    inlineSuggestions: asBool(src.inlineSuggestions, base.inlineSuggestions),
    autoComplete: asBool(src.autoComplete, base.autoComplete),
    formatOnPaste: asBool(src.formatOnPaste, base.formatOnPaste),
  };
}

function sameSettings(a: EditorSettings, b: EditorSettings): boolean {
  return (
    a.fontSize === b.fontSize &&
    a.tabSize === b.tabSize &&
    a.wordWrap === b.wordWrap &&
    a.minimap === b.minimap &&
    a.inlineSuggestions === b.inlineSuggestions &&
    a.autoComplete === b.autoComplete &&
    a.formatOnPaste === b.formatOnPaste
  );
}

// ---------------------------------------------------------------------------
// Shared store
// ---------------------------------------------------------------------------

let current: EditorSettings = DEFAULT_EDITOR_SETTINGS;
let hydrated = false;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

function readStored(): EditorSettings {
  try {
    const raw = window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
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
  current = readStored();
}

function attachStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== EDITOR_SETTINGS_STORAGE_KEY) return;
    setCurrent(readStored(), false);
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
