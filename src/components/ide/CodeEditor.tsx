import Editor, { OnMount } from "@monaco-editor/react";
import { useRef } from "react";

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string) => void;
}

const CodeEditor = ({ language, value, onChange }: CodeEditorProps) => {
  const editorRef = useRef<any>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Define Zuup dark theme
    monaco.editor.defineTheme("zuup-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5c6370", fontStyle: "italic" },
        { token: "keyword", foreground: "e63462" },
        { token: "string", foreground: "98c379" },
        { token: "number", foreground: "d19a66" },
        { token: "type", foreground: "61afef" },
        { token: "function", foreground: "61afef" },
        { token: "variable", foreground: "e06c75" },
        { token: "operator", foreground: "56b6c2" },
        { token: "delimiter", foreground: "abb2bf" },
        { token: "tag", foreground: "e63462" },
        { token: "attribute.name", foreground: "d19a66" },
        { token: "attribute.value", foreground: "98c379" },
      ],
      colors: {
        "editor.background": "#0d0f17",
        "editor.foreground": "#cdd6e4",
        "editor.lineHighlightBackground": "#1a1d2e",
        "editor.selectionBackground": "#e6346233",
        "editor.inactiveSelectionBackground": "#e6346218",
        "editorCursor.foreground": "#e63462",
        "editorLineNumber.foreground": "#3a3f54",
        "editorLineNumber.activeForeground": "#e63462",
        "editorIndentGuide.background": "#1e2133",
        "editorIndentGuide.activeBackground": "#2e3250",
        "editor.selectionHighlightBackground": "#e6346215",
        "editorBracketMatch.background": "#e6346225",
        "editorBracketMatch.border": "#e6346250",
        "editorSuggestWidget.background": "#141724",
        "editorSuggestWidget.border": "#1e2133",
        "editorSuggestWidget.selectedBackground": "#e6346230",
        "editorSuggestWidget.highlightForeground": "#e63462",
        "editorWidget.background": "#141724",
        "editorWidget.border": "#1e2133",
        "scrollbarSlider.background": "#2a2e42",
        "scrollbarSlider.hoverBackground": "#3a3f54",
        "scrollbarSlider.activeBackground": "#e6346250",
      },
    });

    monaco.editor.setTheme("zuup-dark");

    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', monospace",
      fontLigatures: true,
      minimap: { enabled: true, scale: 1 },
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoIndent: "full",
      formatOnPaste: true,
      suggestOnTriggerCharacters: true,
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true,
      },
      parameterHints: { enabled: true },
      wordBasedSuggestions: "allDocuments",
      tabCompletion: "on",
      padding: { top: 16, bottom: 16 },
      scrollBeyondLastLine: false,
      renderLineHighlight: "all",
      guides: {
        bracketPairs: true,
        indentation: true,
      },
    });
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-md">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={(v) => onChange(v || "")}
        onMount={handleMount}
        theme="zuup-dark"
        loading={
          <div className="flex h-full items-center justify-center bg-editor">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground font-mono">Loading editor...</span>
            </div>
          </div>
        }
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', monospace",
          minimap: { enabled: true },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          bracketPairColorization: { enabled: true },
          autoClosingBrackets: "always",
          autoClosingQuotes: "always",
          autoIndent: "full",
          suggestOnTriggerCharacters: true,
          quickSuggestions: { other: true, comments: false, strings: true },
          parameterHints: { enabled: true },
          wordBasedSuggestions: "allDocuments",
          tabCompletion: "on",
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
};

export default CodeEditor;
