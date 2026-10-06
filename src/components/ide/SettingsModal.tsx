import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import ModalShell from "@/components/ide/settings/ModalShell";
import { buttonClass } from "@/components/ide/settings/styles";
import { Segmented, Select, SectionHeading, SettingRow, Stepper, Toggle, type Option } from "@/components/ide/settings/controls";
import { SHORTCUT_GROUPS, formatKeys } from "@/components/ide/palette/shortcuts";
import { downloadFile } from "@/lib/fileSystem";
import { cn } from "@/lib/utils";
import {
  AUTO_SAVE_DELAY_OPTIONS,
  FONT_FAMILY_CSS,
  MAX_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  TAB_SIZE_OPTIONS,
  changedFromDefaults,
  getEditorSettings,
  parseSettingsFile,
  replaceEditorSettings,
  serializeSettings,
  type EditorSettings,
  useEditorSettings,
} from "@/lib/editorSettings";

export type SettingsSection = "editor" | "suggestions" | "running" | "appearance" | "shortcuts" | "data";

const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "editor", label: "Editor" },
  { id: "suggestions", label: "Suggestions" },
  { id: "running", label: "Running code" },
  { id: "appearance", label: "Appearance" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "data", label: "Saving and data" },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Section shown when the dialog opens. Defaults to the last one viewed. */
  initialSection?: SettingsSection;
}

type BooleanKey = {
  [K in keyof EditorSettings]: EditorSettings[K] extends boolean ? K : never;
}[keyof EditorSettings];

const AUTO_SAVE_LABELS: Record<number, string> = {
  0: "Off",
  1000: "After 1 second",
  3000: "After 3 seconds",
  10000: "After 10 seconds",
};

const PREVIEW = [
  "def greet(name):",
  "    if name != \"\":",
  "        return f\"Hello, {name}\"",
  "    return None  # => nothing",
];

const SettingsModal = ({ isOpen, onClose, initialSection }: SettingsModalProps) => {
  const { settings, updateSettings, resetSettings } = useEditorSettings();
  const [section, setSection] = useState<SettingsSection>(initialSection ?? "editor");
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen && initialSection) setSection(initialSection);
  }, [isOpen, initialSection]);

  // Each section starts at the top.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [section]);

  const toggleRow = (key: BooleanKey, label: string, description: ReactNode) => (
    <SettingRow key={key} label={label} description={description} htmlFor={id(key)} descriptionId={id(`${key}-d`)}>
      <Toggle
        id={id(key)}
        checked={settings[key]}
        onCheckedChange={(checked) => updateSettings({ [key]: checked })}
        describedBy={id(`${key}-d`)}
      />
    </SettingRow>
  );

  const content: Record<SettingsSection, ReactNode> = {
    editor: (
      <>
        <SectionHeading>Editor</SectionHeading>
        <SettingRow label="Tab size" description="Spaces per indentation level." labelId={id("tab-l")}>
          <Segmented
            labelledBy={id("tab-l")}
            value={TAB_SIZE_OPTIONS.includes(settings.tabSize as 2 | 4 | 8) ? settings.tabSize : 2}
            options={TAB_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            onChange={(tabSize) => updateSettings({ tabSize })}
          />
        </SettingRow>
        {toggleRow("insertSpaces", "Indent with spaces", "Tab inserts spaces. Turn off to insert a tab character.")}
        {toggleRow("wordWrap", "Word wrap", "Wrap long lines instead of scrolling sideways.")}
        {toggleRow("formatOnPaste", "Format on paste", "Re-indent pasted code to match the lines around it.")}
        {toggleRow("stickyScroll", "Sticky scroll", "Keep the current function or class name pinned at the top while you scroll.")}
      </>
    ),
    suggestions: (
      <>
        <SectionHeading>Suggestions</SectionHeading>
        {toggleRow("autoComplete", "Autocomplete", "Show completions while you type and after characters like a dot.")}
        {toggleRow(
          "inlineSuggestions",
          "Inline suggestions",
          <>
            Faded text that finishes the line. <span className="font-mono text-[11px] text-faint">Tab</span> accepts it,{" "}
            <span className="font-mono text-[11px] text-faint">Esc</span> dismisses it.
          </>,
        )}
      </>
    ),
    running: (
      <>
        <SectionHeading>Running code</SectionHeading>
        <SettingRow
          label="Terminal font size"
          description="Size of program output and input in the terminal."
          htmlFor={id("term-size")}
          descriptionId={id("term-size-d")}
        >
          <Stepper
            id={id("term-size")}
            label="terminal font size"
            value={settings.terminalFontSize}
            min={MIN_TERMINAL_FONT_SIZE}
            max={MAX_TERMINAL_FONT_SIZE}
            unit="px"
            describedBy={id("term-size-d")}
            onChange={(terminalFontSize) => updateSettings({ terminalFontSize })}
          />
        </SettingRow>
        {toggleRow("saveBeforeRun", "Save before running", "Save a cloud project every time you run it, so the saved copy matches what ran.")}
      </>
    ),
    appearance: (
      <>
        <SectionHeading>Appearance</SectionHeading>
        <EditorPreview settings={settings} />
        <SettingRow
          label="Font size"
          description="Ctrl or Cmd with the mouse wheel changes it from the editor."
          htmlFor={id("font-size")}
          descriptionId={id("font-size-d")}
        >
          <Stepper
            id={id("font-size")}
            label="font size"
            value={settings.fontSize}
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            unit="px"
            describedBy={id("font-size-d")}
            onChange={(fontSize) => updateSettings({ fontSize })}
          />
        </SettingRow>
        <SettingRow label="Font" description="The typeface used for code in the editor." htmlFor={id("font")}>
          <Select
            id={id("font")}
            value={settings.fontFamily}
            options={[
              { value: "jetbrains", label: "JetBrains Mono" },
              { value: "system", label: "System monospace" },
            ]}
            onChange={(fontFamily) => updateSettings({ fontFamily })}
          />
        </SettingRow>
        {toggleRow(
          "ligatures",
          "Ligatures",
          <>
            Draw pairs like <Code>=&gt;</Code> and <Code>!=</Code> as single symbols.
          </>,
        )}
        <SettingRow label="Line numbers" labelId={id("ln-l")} description="Relative numbers count lines from the cursor.">
          <Segmented
            labelledBy={id("ln-l")}
            value={settings.lineNumbers}
            options={[
              { value: "on", label: "On" },
              { value: "relative", label: "Relative" },
              { value: "off", label: "Off" },
            ]}
            onChange={(lineNumbers) => updateSettings({ lineNumbers })}
          />
        </SettingRow>
        {toggleRow("minimap", "Minimap", "A zoomed-out view of the file along the right edge.")}
        <SettingRow label="Show whitespace" description="Draw dots for spaces and arrows for tabs." htmlFor={id("ws")}>
          <Select
            id={id("ws")}
            value={settings.renderWhitespace}
            options={[
              { value: "none", label: "Never" },
              { value: "selection", label: "In selections" },
              { value: "boundary", label: "Except between words" },
              { value: "all", label: "Always" },
            ]}
            onChange={(renderWhitespace) => updateSettings({ renderWhitespace })}
          />
        </SettingRow>
        {toggleRow("bracketPairColors", "Bracket pair colours", "Give each level of nested brackets its own colour.")}
        <SettingRow label="Cursor style" labelId={id("cur-l")}>
          <Segmented
            labelledBy={id("cur-l")}
            value={settings.cursorStyle}
            options={[
              { value: "line", label: "Line" },
              { value: "block", label: "Block" },
              { value: "underline", label: "Underline" },
            ]}
            onChange={(cursorStyle) => updateSettings({ cursorStyle })}
          />
        </SettingRow>
        <SettingRow label="Cursor blinking" labelId={id("blink-l")}>
          <Segmented
            labelledBy={id("blink-l")}
            value={settings.cursorBlinking}
            options={[
              { value: "smooth", label: "Fade" },
              { value: "blink", label: "Blink" },
              { value: "solid", label: "Steady" },
            ]}
            onChange={(cursorBlinking) => updateSettings({ cursorBlinking })}
          />
        </SettingRow>
      </>
    ),
    shortcuts: <ShortcutList />,
    data: <DataSection settings={settings} onReset={resetSettings} updateSettings={updateSettings} id={id} />,
  };

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Settings"
      description="Saved in this browser. Changes apply right away."
      className="max-w-[54rem] sm:h-[min(40rem,88vh)]"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        navRef.current?.querySelector<HTMLButtonElement>(`[data-section='${initialSection ?? section}']`)?.focus({ preventScroll: true });
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col border-t border-rule sm:flex-row">
        <nav ref={navRef} aria-label="Settings sections" className="shrink-0 border-b border-rule sm:w-52 sm:border-b-0 sm:border-r">
          <ul className="flex gap-1 overflow-x-auto px-3 py-2 sm:flex-col sm:gap-0.5 sm:px-3 sm:py-4">
            {SETTINGS_SECTIONS.map((s) => {
              const active = s.id === section;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    data-section={s.id}
                    onClick={() => setSection(s.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-8 w-full items-center whitespace-nowrap rounded-md px-3 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      active ? "bg-ink/60 text-foreground" : "text-muted-foreground hover:bg-ink/40 hover:text-foreground",
                    )}
                  >
                    {active ? (
                      <span aria-hidden="true" className="absolute inset-y-2 left-0 hidden w-[2px] rounded-full bg-primary sm:block" />
                    ) : null}
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4" role="region" aria-label={SETTINGS_SECTIONS.find((s) => s.id === section)?.label}>
          {content[section]}
        </div>
      </div>
    </ModalShell>
  );
};

/** Four lines of code in the chosen font, size and line-number style. */
const EditorPreview = ({ settings }: { settings: EditorSettings }) => {
  const size = Math.min(settings.fontSize, 18);
  return (
    <div
      aria-hidden="true"
      className="my-3 overflow-hidden rounded-md border border-rule bg-ink py-3 text-foreground"
      style={{
        fontFamily: FONT_FAMILY_CSS[settings.fontFamily],
        fontSize: size,
        lineHeight: 1.55,
        fontVariantLigatures: settings.ligatures ? "normal" : "none",
        fontFeatureSettings: settings.ligatures ? '"calt" 1, "liga" 1' : '"calt" 0, "liga" 0',
      }}
    >
      {PREVIEW.map((line, i) => {
        const n = settings.lineNumbers === "off" ? null : settings.lineNumbers === "relative" ? (i === 1 ? 2 : Math.abs(i - 1)) : i + 1;
        return (
          <div key={i} className={cn("flex whitespace-pre pr-4", i === 1 && "bg-raised/60")}>
            {n !== null ? <span className="w-10 shrink-0 select-none pr-3 text-right text-faint">{n}</span> : <span className="w-4 shrink-0" />}
            <span>
              {i === 1 ? (
                <>
                  {line.slice(0, 4)}
                  <span
                    className={cn(
                      "inline-block align-middle",
                      settings.cursorStyle === "line" && "w-[2px] bg-foreground",
                      settings.cursorStyle === "block" && "w-[0.6em] bg-foreground/70",
                      settings.cursorStyle === "underline" && "w-[0.6em] border-b-2 border-foreground",
                    )}
                    style={{ height: "1.1em" }}
                  />
                  {line.slice(4)}
                </>
              ) : (
                line
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** Literal characters in a description, shown in the code face without ligatures. */
const Code = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[11px] text-foreground/80 [font-variant-ligatures:none]">{children}</span>
);

const ShortcutList = () => (
  <>
    <SectionHeading note="These are fixed for now. Shortcuts marked with a place only work there.">Keyboard shortcuts</SectionHeading>
    {SHORTCUT_GROUPS.map((group) => (
      <section key={group.title} className="mt-5 first-of-type:mt-3">
        <h4 className="mb-1 text-[12px] font-semibold text-muted-foreground">{group.title}</h4>
        <dl>
          {group.items.map((s) => (
            <div key={s.id} className="flex items-baseline justify-between gap-6 border-b border-rule py-2 last:border-b-0">
              <dt className="text-[13px] text-foreground">
                {s.label}
                {s.where ? <span className="ml-2 text-[12px] text-faint">{s.where}</span> : null}
              </dt>
              <dd className="text-[12px] text-faint">
                <span className="font-mono text-[11px]">{formatKeys(s.keys)}</span>
                {s.alt ? (
                  <>
                    {" or "}
                    <span className="font-mono text-[11px]">{formatKeys(s.alt)}</span>
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    ))}
  </>
);

const DataSection = ({
  settings,
  onReset,
  updateSettings,
  id,
}: {
  settings: EditorSettings;
  onReset: () => void;
  updateSettings: (patch: Partial<EditorSettings>) => void;
  id: (name: string) => string;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const changed = changedFromDefaults(settings).length;

  useEffect(() => {
    if (!confirmingReset) return;
    const t = setTimeout(() => setConfirmingReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingReset]);

  const autoSaveOptions: Option<number>[] = AUTO_SAVE_DELAY_OPTIONS.map((ms) => ({ value: ms, label: AUTO_SAVE_LABELS[ms] }));

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 64 * 1024) {
      toast.error("Could not import settings", { description: "That file is too large to be a settings file." });
      return;
    }
    const result = parseSettingsFile(await file.text(), getEditorSettings());
    if (result.ok === false) {
      toast.error("Could not import settings", { description: result.error });
      return;
    }
    replaceEditorSettings(result.settings);
    toast.success("Settings imported", {
      description: result.ignored.length > 0 ? `Skipped ${result.ignored.length} unknown setting${result.ignored.length > 1 ? "s" : ""}.` : undefined,
    });
  };

  return (
    <>
      <SectionHeading>Saving and data</SectionHeading>
      <SettingRow
        label="Auto-save cloud projects"
        description="How long after your last change a cloud project saves itself. Your work is also kept in this browser as you type."
        htmlFor={id("autosave")}
      >
        <Select id={id("autosave")} value={settings.autoSaveDelay} options={autoSaveOptions} onChange={(autoSaveDelay) => updateSettings({ autoSaveDelay })} />
      </SettingRow>
      <SettingRow
        label="Warn before leaving"
        description="Ask before closing the page while a cloud project has changes that are not saved yet."
        htmlFor={id("leave")}
        descriptionId={id("leave-d")}
      >
        <Toggle
          id={id("leave")}
          checked={settings.confirmBeforeLeave}
          onCheckedChange={(confirmBeforeLeave) => updateSettings({ confirmBeforeLeave })}
          describedBy={id("leave-d")}
        />
      </SettingRow>
      <SettingRow label="Settings file" description="Export these settings as JSON to use on another computer, or import a file exported from Zuup Code.">
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} tabIndex={-1} aria-hidden="true" />
        <div className="flex gap-2">
          <button type="button" className={buttonClass.secondary} onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button
            type="button"
            className={buttonClass.secondary}
            onClick={() => {
              downloadFile("zuup-code-settings.json", serializeSettings(settings));
              toast.success("Settings exported");
            }}
          >
            Export
          </button>
        </div>
      </SettingRow>
      <SettingRow
        label="Defaults"
        description={changed === 0 ? "Every setting is at its default." : `${changed} setting${changed > 1 ? "s differ" : " differs"} from the default.`}
      >
        <button
          type="button"
          disabled={changed === 0}
          className={cn(buttonClass.secondary, confirmingReset && "border-danger/50 text-danger hover:bg-danger/10")}
          onClick={() => {
            if (!confirmingReset) {
              setConfirmingReset(true);
              return;
            }
            setConfirmingReset(false);
            onReset();
            toast.success("Settings reset to defaults");
          }}
        >
          {confirmingReset ? "Click again to reset" : "Reset to defaults"}
        </button>
      </SettingRow>
    </>
  );
};

export default SettingsModal;
