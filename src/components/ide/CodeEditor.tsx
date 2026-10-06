import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadMonaco } from "@/lib/editor/loadMonaco";
import { computeMinimalEdit } from "@/lib/editor/textDiff";
import { ZUUP_THEME } from "@/lib/editor/theme";
import { MAX_FONT_SIZE, MIN_FONT_SIZE, useEditorSettings } from "@/lib/editorSettings";

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (pos: { line: number; col: number }) => void;
  /**
   * Unique id of the file. Each id gets its own Monaco model so undo history,
   * scroll position and selection are kept per file while switching tabs.
   */
  filePath?: string;
  /** Called for Ctrl/Cmd+Enter. */
  onRun?: () => void;
  /** Called for Ctrl/Cmd+S. */
  onSave?: () => void;
  /** @deprecated Ignored; font size now lives in the shared editor settings. */
  fontSize?: number;
  /** @deprecated Ignored; font size now lives in the shared editor settings. */
  onFontSizeChange?: (size: number) => void;
  /**
   * Ids (`filePath` values) of every file that still exists. Models of other files (deleted ones)
   * are disposed so they stop leaking memory and stop feeding the TypeScript service.
   */
  liveFileIds?: readonly string[];
}

const MODEL_SCHEME = "file:///zuup/";

/** Extension per Monaco language so the TypeScript service treats files correctly. */
const MODEL_EXTENSION: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  json: "json",
  html: "html",
  css: "css",
  markdown: "md",
};

function modelPath(filePath: string | undefined, language: string): string | undefined {
  if (!filePath) return undefined;
  const ext = MODEL_EXTENSION[language] ?? "txt";
  return `${MODEL_SCHEME}${encodeURIComponent(filePath)}.${ext}`;
}

/** The `filePath` a model created by this component belongs to, or null for other models. */
function modelFileId(model: MonacoEditor.ITextModel): string | null {
  if (!model.uri.toString().startsWith(MODEL_SCHEME)) return null;
  const rest = model.uri.path.replace(/^\/zuup\//, "");
  const dot = rest.lastIndexOf(".");
  return dot > 0 ? rest.slice(0, dot) : null;
}

const EditorLoading = ({ label = "Loading editor..." }: { label?: string }) => (
  <div className="flex h-full items-center justify-center bg-editor" role="status">
    <div className="flex items-center gap-3">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm text-muted-foreground font-mono">{label}</span>
    </div>
  </div>
);

const CodeEditor = ({ language, value, onChange, onCursorChange, filePath, onRun, onSave, liveFileIds }: CodeEditorProps) => {
  const { settings, updateSettings } = useEditorSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const applyingExternal = useRef(false);

  const [monacoReady, setMonacoReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Latest callbacks, so editor commands never call stale closures.
  const latest = useRef({ onChange, onCursorChange, onRun, onSave });
  latest.current = { onChange, onCursorChange, onRun, onSave };

  const fontSizeRef = useRef(settings.fontSize);
  fontSizeRef.current = settings.fontSize;

  // Load the (bundled, lazily fetched) Monaco runtime.
  useEffect(() => {
    let alive = true;
    setLoadError(false);
    loadMonaco().then(
      () => alive && setMonacoReady(true),
      () => alive && setLoadError(true),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Ctrl/Cmd + mouse wheel zoom, stored in the shared settings.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSizeRef.current + delta));
      if (next !== fontSizeRef.current) updateSettings({ fontSize: next });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [updateSettings]);

  const options = useMemo<MonacoEditor.IStandaloneEditorConstructionOptions>(
    () => ({
      ariaLabel: "Code editor",
      fontSize: settings.fontSize,
      fontFamily: "'JetBrains Mono', monospace",
      fontLigatures: true,
      tabSize: settings.tabSize,
      insertSpaces: true,
      detectIndentation: false,
      wordWrap: settings.wordWrap ? "on" : "off",
      minimap: { enabled: settings.minimap, scale: 1 },
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: "languageDefined",
      autoClosingQuotes: "languageDefined",
      autoIndent: "full",
      formatOnPaste: settings.formatOnPaste,
      automaticLayout: true,

      // Completions: typing and trigger characters, but never inside comments or strings.
      quickSuggestions: settings.autoComplete ? { other: "on", comments: "off", strings: "off" } : false,
      suggestOnTriggerCharacters: settings.autoComplete,
      wordBasedSuggestions: "currentDocument",
      snippetSuggestions: "inline",
      // Enter only accepts a suggestion when it would not change what was typed.
      acceptSuggestionOnEnter: "smart",
      // Tab belongs to the suggest widget and to inline (ghost) suggestions.
      tabCompletion: "off",
      suggestSelection: "first",
      parameterHints: { enabled: true, cycle: true },
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showWords: true,
        showFunctions: true,
        showClasses: true,
        showMethods: true,
        showProperties: true,
        preview: true,
        previewMode: "subwordSmart",
        shareSuggestSelections: false,
        showStatusBar: false,
      },

      // Ghost text: Tab accepts, Ctrl/Cmd+Right accepts a word, Esc dismisses.
      inlineSuggest: {
        enabled: settings.inlineSuggestions,
        mode: "subword",
        showToolbar: "onHover",
        suppressSuggestions: false,
        keepOnBlur: false,
      },

      padding: { top: 16, bottom: 16 },
      scrollBeyondLastLine: false,
      renderLineHighlight: "all",
      guides: { bracketPairs: true, indentation: true },
    }),
    [settings],
  );

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      latest.current.onCursorChange?.({ line: e.position.lineNumber, col: e.position.column });
    });
    const pos = editor.getPosition();
    if (pos) latest.current.onCursorChange?.({ line: pos.lineNumber, col: pos.column });

    // Registered as editor commands so they replace Monaco's own bindings
    // (Ctrl+Enter would otherwise insert a line below).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => latest.current.onSave?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => latest.current.onRun?.());
    // Alt+\ asks for a ghost-text suggestion explicitly (Monaco ships the action without a key).
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Backslash, () =>
      editor.trigger("keyboard", "editor.action.inlineSuggest.trigger", {}),
    );

    setMounted(true);
  }, []);

  // Apply external changes (version restore, repository pull, switching to a
  // model that changed while it was hidden) as a minimal edit so the cursor
  // and scroll position stay put. Typing never gets here: Monaco's content
  // already equals `value` after the parent state update.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const current = model.getValue();
    const edit = computeMinimalEdit(current, value);
    if (!edit) return;

    applyingExternal.current = true;
    try {
      const start = model.getPositionAt(edit.start);
      const end = model.getPositionAt(edit.end);
      editor.pushUndoStop();
      editor.executeEdits("zuup-external", [
        {
          range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
          text: edit.text,
          forceMoveMarkers: true,
        },
      ]);
      editor.pushUndoStop();
    } finally {
      applyingExternal.current = false;
    }
  }, [value, filePath, mounted]);

  const handleChange = useCallback((next: string | undefined) => {
    if (applyingExternal.current) return;
    latest.current.onChange(next ?? "");
  }, []);

  // Switching a file's language changes its model URI: drop the file's previous model.
  useEffect(() => {
    const monaco = monacoRef.current;
    const current = editorRef.current?.getModel();
    const expected = modelPath(filePath, language);
    if (!monaco || !current || !filePath || !expected) return;
    const keep = monaco.Uri.parse(expected).toString();
    monaco.editor.getModels().forEach((m) => {
      if (m !== current && m.uri.toString() !== keep && modelFileId(m) === filePath) m.dispose();
    });
  }, [filePath, language, mounted]);

  // Dispose models of files that no longer exist (deleted files, closed projects).
  const liveKey = liveFileIds ? liveFileIds.join("\u0000") : null;
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || liveKey === null) return;
    const live = new Set(liveKey ? liveKey.split("\u0000") : []);
    const current = editorRef.current?.getModel();
    monaco.editor.getModels().forEach((m) => {
      const id = modelFileId(m);
      if (id !== null && m !== current && !live.has(id)) m.dispose();
    });
  }, [liveKey, mounted]);

  // The wrapper keeps models alive on unmount (to preserve undo history across
  // tab switches); release the ones created here when the editor goes away.
  useEffect(
    () => () => {
      const monaco = monacoRef.current;
      editorRef.current = null;
      monaco?.editor.getModels().forEach((m) => {
        if (m.uri.toString().startsWith(MODEL_SCHEME)) m.dispose();
      });
    },
    [],
  );

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden" role="region" aria-label="Code editor">
      {loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-editor px-6 text-center" role="alert">
          <p className="text-sm text-foreground">The editor could not be loaded.</p>
          <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        </div>
      ) : !monacoReady ? (
        <EditorLoading />
      ) : (
        <Editor
          height="100%"
          language={language}
          defaultValue={value}
          path={modelPath(filePath, language)}
          keepCurrentModel
          onChange={handleChange}
          onMount={handleMount}
          theme={ZUUP_THEME}
          loading={<EditorLoading />}
          options={options}
        />
      )}
    </div>
  );
};

export default CodeEditor;
