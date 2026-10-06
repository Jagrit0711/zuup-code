/**
 * Keyboard shortcuts shown in the command palette and the settings dialog.
 * Keys are written with "Mod" for Ctrl (Windows, Linux, ChromeOS) or Cmd (macOS).
 */
export interface ShortcutDef {
  id: string;
  label: string;
  keys: string;
  /** A second key combination that does the same. */
  alt?: string;
  /** Where the shortcut works, when it is not everywhere. */
  where?: string;
}

export const SHORTCUT_GROUPS: { title: string; items: ShortcutDef[] }[] = [
  {
    title: "General",
    items: [
      { id: "palette", label: "Show all commands", keys: "Mod+K", alt: "Mod+Shift+P" },
      { id: "goto-file", label: "Go to file", keys: "Mod+P" },
      { id: "shortcuts", label: "Keyboard shortcuts", keys: "Mod+/" },
      { id: "settings", label: "Open settings", keys: "Mod+," },
      { id: "toggle-sidebar", label: "Toggle sidebar", keys: "Mod+B" },
      { id: "toggle-terminal", label: "Toggle terminal", keys: "Mod+J" },
    ],
  },
  {
    title: "Files and projects",
    items: [
      { id: "save", label: "Save", keys: "Mod+S" },
      { id: "new-file", label: "New file", keys: "Alt+N" },
      { id: "new-project", label: "New project", keys: "Alt+Shift+N" },
      { id: "download", label: "Download file", keys: "Mod+Shift+S" },
      { id: "rename", label: "Rename", keys: "F2", where: "Explorer" },
      { id: "delete", label: "Delete", keys: "Delete", where: "Explorer" },
    ],
  },
  {
    title: "Code",
    items: [
      { id: "run", label: "Run", keys: "Mod+Enter" },
      { id: "accept-suggestion", label: "Accept suggestion", keys: "Tab", where: "Editor" },
      { id: "accept-word", label: "Accept next word of a suggestion", keys: "Mod+Right", where: "Editor" },
      { id: "ask-suggestion", label: "Ask for a suggestion", keys: "Alt+\\", where: "Editor" },
      { id: "comment", label: "Comment line", keys: "Mod+/", where: "Editor" },
      { id: "zoom", label: "Change font size", keys: "Mod+Wheel", where: "Editor" },
    ],
  },
];

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** "Mod+Shift+P" -> "Ctrl+Shift+P" or "Cmd+Shift+P". */
export function formatKeys(keys: string, mac = isMacPlatform()): string {
  return keys.replace(/\bMod\b/g, mac ? "Cmd" : "Ctrl").replace(/\bAlt\b/g, mac ? "Option" : "Alt");
}

/** Look up a shortcut's keys by id, formatted for this platform. */
export function shortcutFor(id: string, mac = isMacPlatform()): string | undefined {
  for (const group of SHORTCUT_GROUPS) {
    const hit = group.items.find((s) => s.id === id);
    if (hit) return formatKeys(hit.keys, mac);
  }
  return undefined;
}
