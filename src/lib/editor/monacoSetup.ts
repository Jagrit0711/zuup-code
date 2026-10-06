/**
 * One-time Monaco bootstrap. Monaco is bundled with the app (no third-party
 * CDN at runtime) and this module is only ever imported dynamically, so the
 * editor code lands in its own lazy chunk.
 *
 * Everything registered here (theme, TypeScript service, completion and
 * inline providers, extra languages) is registered exactly once per Monaco
 * instance and replaced cleanly on hot reload.
 */
import { loader, type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker.js?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import { getEditorSettings } from "@/lib/editorSettings";
import { registerExtraLanguages } from "./monarch";
import { registerCompletionProviders, registerInlineCompletions } from "./monacoProviders";
import { ZUUP_THEME, ZUUP_THEME_DATA } from "./theme";
import { configureTypeScript } from "./tsConfig";

interface MonacoGlobal {
  MonacoEnvironment?: monaco.Environment;
  __zuupMonacoDisposables?: monaco.IDisposable[];
  monaco?: unknown;
}

const g = globalThis as unknown as MonacoGlobal;

g.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

let setupPromise: Promise<Monaco> | null = null;

function register() {
  // Hot reload re-evaluates this module: drop what the previous evaluation registered.
  g.__zuupMonacoDisposables?.forEach((d) => d.dispose());

  monaco.editor.defineTheme(ZUUP_THEME, ZUUP_THEME_DATA);
  configureTypeScript(monaco);

  g.__zuupMonacoDisposables = [
    ...registerExtraLanguages(monaco),
    registerCompletionProviders(monaco as unknown as Monaco),
    registerInlineCompletions(monaco as unknown as Monaco, () => getEditorSettings().inlineSuggestions),
  ];

  if (import.meta.env.DEV) g.monaco = monaco;
}

/** Idempotent: resolves with the configured Monaco instance. */
export function setupMonaco(): Promise<Monaco> {
  if (!setupPromise) {
    setupPromise = loader.init().then((instance) => {
      register();
      return instance;
    });
    setupPromise.catch(() => {
      setupPromise = null; // allow a retry after a failed chunk load
    });
  }
  return setupPromise;
}
