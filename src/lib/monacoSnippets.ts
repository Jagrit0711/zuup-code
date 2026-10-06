// ==============================================================
// Zuup Code - snippet and completion facade.
//
// The completion data now lives in src/lib/editor/languageData (one
// data table per language) and the engine in src/lib/editor/completions.ts.
// This module keeps the small public API that earlier code and tests use.
// ==============================================================

import type { Monaco } from "@monaco-editor/react";
import type { IDisposable } from "monaco-editor";
import { registerCompletionProviders } from "@/lib/editor/monacoProviders";
import { getLanguageData } from "@/lib/editor/languageData";
import { words } from "@/lib/editor/languageData/types";
import { renderSnippet } from "@/lib/editor/snippet";

/**
 * Register the completion providers for every supported language on `monaco`.
 * The editor bootstrap (src/lib/editor/monacoSetup.ts) already does this once;
 * call this only for a Monaco instance that did not go through that bootstrap.
 */
export function registerMonacoLanguageSnippets(monaco: Monaco): IDisposable {
  return registerCompletionProviders(monaco);
}

/**
 * Snippets and common functions of a language as plain data, for tests and
 * external consumers. Insert text has placeholders resolved to their defaults.
 */
export function getLanguageSnippets(lang: string): { label: string; insertText: string; documentation?: string }[] {
  const data = getLanguageData(lang);
  if (!data) return [];

  const seen = new Set<string>();
  const out: { label: string; insertText: string; documentation?: string }[] = [];
  for (const s of data.snippets) {
    seen.add(s.prefix);
    out.push({ label: s.prefix, insertText: renderSnippet(s.body).text, documentation: s.detail });
  }
  for (const fn of words(data.functions)) {
    const name = fn.replace(/\(\)$/, "");
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ label: name, insertText: `${name}()`, documentation: `${name}(...)` });
  }
  return out;
}
