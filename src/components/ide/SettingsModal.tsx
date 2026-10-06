import { Monitor, RotateCcw, Sparkles, Type } from "lucide-react";
import { useId } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  TAB_SIZE_OPTIONS,
  type EditorSettings,
  useEditorSettings,
} from "@/lib/editorSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** @deprecated Ignored; settings are read from and written to the shared store. */
  fontSize?: number;
  /** @deprecated Ignored. */
  onFontSizeChange?: (size: number) => void;
  /** @deprecated Ignored. */
  tabSize?: number;
  /** @deprecated Ignored. */
  onTabSizeChange?: (size: number) => void;
  /** @deprecated Ignored. */
  wordWrap?: boolean;
  /** @deprecated Ignored. */
  onWordWrapChange?: (wrap: boolean) => void;
}

type BooleanKey = {
  [K in keyof EditorSettings]: EditorSettings[K] extends boolean ? K : never;
}[keyof EditorSettings];

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const ToggleRow = ({ id, label, description, checked, onCheckedChange }: ToggleRowProps) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0 space-y-0.5">
      <label htmlFor={id} className="block cursor-pointer text-xs font-medium text-foreground">
        {label}
      </label>
      <p id={`${id}-desc`} className="text-[11px] leading-snug text-muted-foreground">
        {description}
      </p>
    </div>
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-describedby={`${id}-desc`}
      className="mt-0.5 h-5 w-9 shrink-0"
    />
  </div>
);

const SectionTitle = ({ icon: Icon, children }: { icon: typeof Type; children: string }) => (
  <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
    <Icon size={13} aria-hidden="true" />
    {children}
  </h3>
);

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const { settings, updateSettings, resetSettings } = useEditorSettings();
  const uid = useId();
  const ids = {
    fontSize: `${uid}-font-size`,
    wordWrap: `${uid}-word-wrap`,
    minimap: `${uid}-minimap`,
    formatOnPaste: `${uid}-format-on-paste`,
    autoComplete: `${uid}-auto-complete`,
    inlineSuggestions: `${uid}-inline-suggestions`,
  };

  const toggle = (key: BooleanKey) => (checked: boolean) => updateSettings({ [key]: checked });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md gap-0 overflow-y-auto rounded-xl border-border bg-transparent p-0 shadow-2xl glass-strong glow-primary">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5 pr-12">
          <Monitor size={16} className="text-primary" aria-hidden="true" />
          <DialogTitle className="text-sm font-semibold text-foreground">Settings</DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Editor preferences. Changes apply immediately and are saved in this browser.
        </DialogDescription>

        <div className="space-y-6 p-5">
          <section className="space-y-4" aria-label="Editor">
            <SectionTitle icon={Type}>Editor</SectionTitle>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor={ids.fontSize} className="text-xs font-medium text-foreground">
                  Font size
                </label>
                <span className="font-mono text-xs text-muted-foreground" aria-live="polite">
                  {settings.fontSize}px
                </span>
              </div>
              <input
                id={ids.fontSize}
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                value={settings.fontSize}
                onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">Ctrl or Cmd with the mouse wheel zooms the editor too.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span id={`${uid}-tab-size`} className="text-xs font-medium text-foreground">
                  Tab size
                </span>
                <span className="font-mono text-xs text-muted-foreground">{settings.tabSize} spaces</span>
              </div>
              <ToggleGroup
                type="single"
                value={String(settings.tabSize)}
                onValueChange={(v) => v && updateSettings({ tabSize: Number(v) })}
                aria-labelledby={`${uid}-tab-size`}
                className="grid grid-cols-3 gap-2"
              >
                {TAB_SIZE_OPTIONS.map((size) => (
                  <ToggleGroupItem
                    key={size}
                    value={String(size)}
                    aria-label={`${size} spaces`}
                    className="h-8 rounded bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {size}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <ToggleRow
              id={ids.wordWrap}
              label="Word wrap"
              description="Wrap long lines instead of scrolling sideways."
              checked={settings.wordWrap}
              onCheckedChange={toggle("wordWrap")}
            />
            <ToggleRow
              id={ids.minimap}
              label="Minimap"
              description="Show the code overview on the right edge."
              checked={settings.minimap}
              onCheckedChange={toggle("minimap")}
            />
            <ToggleRow
              id={ids.formatOnPaste}
              label="Format on paste"
              description="Re-indent pasted code to match its surroundings."
              checked={settings.formatOnPaste}
              onCheckedChange={toggle("formatOnPaste")}
            />
          </section>

          <section className="space-y-4" aria-label="Suggestions">
            <SectionTitle icon={Sparkles}>Suggestions</SectionTitle>
            <ToggleRow
              id={ids.autoComplete}
              label="Autocomplete"
              description="Show completions while you type and after characters like a dot."
              checked={settings.autoComplete}
              onCheckedChange={toggle("autoComplete")}
            />
            <ToggleRow
              id={ids.inlineSuggestions}
              label="Inline suggestions"
              description="Show faded ghost text to finish the line or block. Tab accepts it, Ctrl or Cmd with the right arrow accepts one word, Esc dismisses it."
              checked={settings.inlineSuggestions}
              onCheckedChange={toggle("inlineSuggestions")}
            />
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={resetSettings}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
