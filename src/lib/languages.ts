export type LanguageGroupId = "popular" | "systems" | "scripting" | "functional" | "web" | "data" | "text";

export interface LanguageConfig {
  id: string;
  label: string;
  /** Monaco language id used for syntax highlighting. */
  monacoId: string;
  /** Primary file extension, including the leading dot. */
  extension: string;
  /** Extra extensions that also map to this language (lowercase, leading dot). */
  aliases?: string[];
  /** Key understood by src/lib/pistonApi.ts. Empty when the language cannot be executed. */
  pistonLang: string;
  pistonVersion: string;
  /** Section used by language pickers. */
  group: LanguageGroupId;
}

export const LANGUAGE_GROUPS: { id: LanguageGroupId; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "systems", label: "Systems" },
  { id: "scripting", label: "Scripting" },
  { id: "functional", label: "Functional & JVM" },
  { id: "web", label: "Web" },
  { id: "data", label: "Data & markup" },
  { id: "text", label: "Text" },
];

/** Languages offered first on the empty-state quick picker. */
export const POPULAR_LANGUAGE_IDS = [
  "python",
  "javascript",
  "typescript",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "html",
  "php",
  "ruby",
];

export const languages: LanguageConfig[] = [
  { id: "python", label: "Python", monacoId: "python", extension: ".py", aliases: [".pyw"], pistonLang: "python", pistonVersion: "3.10.0", group: "popular" },
  { id: "c", label: "C", monacoId: "c", extension: ".c", aliases: [".h"], pistonLang: "c", pistonVersion: "10.2.0", group: "systems" },
  { id: "html", label: "HTML", monacoId: "html", extension: ".html", aliases: [".htm"], pistonLang: "", pistonVersion: "", group: "web" },
  { id: "css", label: "CSS", monacoId: "css", extension: ".css", pistonLang: "", pistonVersion: "", group: "web" },
  { id: "javascript", label: "JavaScript", monacoId: "javascript", extension: ".js", aliases: [".mjs", ".cjs", ".jsx"], pistonLang: "javascript", pistonVersion: "18.15.0", group: "popular" },
  { id: "typescript", label: "TypeScript", monacoId: "typescript", extension: ".ts", aliases: [".tsx", ".mts", ".cts"], pistonLang: "typescript", pistonVersion: "5.0.3", group: "popular" },
  { id: "java", label: "Java", monacoId: "java", extension: ".java", pistonLang: "java", pistonVersion: "15.0.2", group: "popular" },
  { id: "cpp", label: "C++", monacoId: "cpp", extension: ".cpp", aliases: [".cc", ".cxx", ".hpp", ".hh"], pistonLang: "c++", pistonVersion: "10.2.0", group: "systems" },
  { id: "rust", label: "Rust", monacoId: "rust", extension: ".rs", pistonLang: "rust", pistonVersion: "1.68.2", group: "systems" },
  { id: "go", label: "Go", monacoId: "go", extension: ".go", pistonLang: "go", pistonVersion: "1.16.2", group: "systems" },
  { id: "plaintext", label: "Plain Text", monacoId: "plaintext", extension: ".txt", aliases: [".log"], pistonLang: "", pistonVersion: "", group: "text" },
  { id: "csv", label: "CSV", monacoId: "plaintext", extension: ".csv", pistonLang: "", pistonVersion: "", group: "data" },
  { id: "markdown", label: "Markdown", monacoId: "markdown", extension: ".md", aliases: [".markdown"], pistonLang: "", pistonVersion: "", group: "text" },
  { id: "json", label: "JSON", monacoId: "json", extension: ".json", aliases: [".jsonc"], pistonLang: "", pistonVersion: "", group: "data" },
  { id: "php", label: "PHP", monacoId: "php", extension: ".php", pistonLang: "php", pistonVersion: "8.2.3", group: "scripting" },
  { id: "ruby", label: "Ruby", monacoId: "ruby", extension: ".rb", pistonLang: "ruby", pistonVersion: "3.0.1", group: "scripting" },
  { id: "swift", label: "Swift", monacoId: "swift", extension: ".swift", pistonLang: "swift", pistonVersion: "5.3.3", group: "systems" },
  { id: "csharp", label: "C#", monacoId: "csharp", extension: ".cs", pistonLang: "csharp", pistonVersion: "6.12.0", group: "popular" },
  { id: "kotlin", label: "Kotlin", monacoId: "kotlin", extension: ".kt", aliases: [".kts"], pistonLang: "kotlin", pistonVersion: "1.8.20", group: "functional" },
  { id: "bash", label: "Bash", monacoId: "shell", extension: ".sh", aliases: [".bash", ".zsh"], pistonLang: "bash", pistonVersion: "5.2.0", group: "scripting" },
  { id: "lua", label: "Lua", monacoId: "lua", extension: ".lua", pistonLang: "lua", pistonVersion: "5.4.4", group: "scripting" },
  { id: "perl", label: "Perl", monacoId: "perl", extension: ".pl", aliases: [".pm"], pistonLang: "perl", pistonVersion: "5.36.0", group: "scripting" },
  { id: "r", label: "R", monacoId: "r", extension: ".r", pistonLang: "r", pistonVersion: "4.1.1", group: "scripting" },
  { id: "scala", label: "Scala", monacoId: "scala", extension: ".scala", aliases: [".sc"], pistonLang: "scala", pistonVersion: "3.2.2", group: "functional" },
  { id: "haskell", label: "Haskell", monacoId: "haskell", extension: ".hs", pistonLang: "haskell", pistonVersion: "9.0.1", group: "functional" },
  { id: "clojure", label: "Clojure", monacoId: "clojure", extension: ".clj", aliases: [".cljs", ".cljc", ".edn"], pistonLang: "clojure", pistonVersion: "1.10.3", group: "functional" },
  { id: "dart", label: "Dart", monacoId: "dart", extension: ".dart", pistonLang: "dart", pistonVersion: "2.19.6", group: "scripting" },
  { id: "elixir", label: "Elixir", monacoId: "elixir", extension: ".ex", aliases: [".exs"], pistonLang: "elixir", pistonVersion: "1.11.3", group: "functional" },
  { id: "nim", label: "Nim", monacoId: "nim", extension: ".nim", pistonLang: "nim", pistonVersion: "1.6.2", group: "systems" },
  { id: "sql", label: "SQL", monacoId: "sql", extension: ".sql", pistonLang: "", pistonVersion: "", group: "data" },
  { id: "yaml", label: "YAML", monacoId: "yaml", extension: ".yaml", aliases: [".yml"], pistonLang: "", pistonVersion: "", group: "data" },
  { id: "xml", label: "XML", monacoId: "xml", extension: ".xml", aliases: [".svg", ".xsd", ".xsl"], pistonLang: "", pistonVersion: "", group: "data" },
];

const PLAINTEXT = languages.find((l) => l.id === "plaintext") as LanguageConfig;

const languagesById = new Map<string, LanguageConfig>(languages.map((l) => [l.id, l]));

const languageByExtension = new Map<string, LanguageConfig>();
for (const lang of languages) {
  for (const ext of [lang.extension, ...(lang.aliases ?? [])]) {
    if (!languageByExtension.has(ext)) languageByExtension.set(ext, lang);
  }
}

/** Looks a language up by id. Unknown ids resolve to plain text. */
export function getLanguageById(id: string): LanguageConfig {
  return languagesById.get(id) ?? PLAINTEXT;
}

/** True when `id` is one of the registered language ids. */
export function isKnownLanguageId(id: string): boolean {
  return languagesById.has(id);
}

/** Languages that can be executed through the Piston proxy. */
export function getRunnableLanguages(): LanguageConfig[] {
  return languages.filter((l) => l.pistonLang !== "");
}

/** Languages grouped for pickers, in display order, skipping empty groups. */
export function getLanguagesByGroup(): { id: LanguageGroupId; label: string; languages: LanguageConfig[] }[] {
  return LANGUAGE_GROUPS.map((group) => ({
    ...group,
    languages: languages
      .filter((l) => l.group === group.id)
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" })),
  })).filter((group) => group.languages.length > 0);
}

/**
 * Detect language configuration from a file name's extension.
 * Names without an extension, dotfiles and unknown extensions resolve to plain text.
 */
export function detectLanguageFromFilename(fileName: string): LanguageConfig {
  const base = fileName.split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return PLAINTEXT;
  return languageByExtension.get(base.slice(dot).toLowerCase()) ?? PLAINTEXT;
}

/**
 * Detects if a code string uses standard input functions (scanf, cin >>, input(), Scanner, etc.)
 */
export function detectNeedsStdin(code: string, lang: string): boolean {
  if (!code) return false;
  const key = lang.toLowerCase();

  // Strip single-line & multi-line comments to avoid false positives
  let stripped = code
    .replace(/#.*/g, "") // Python / bash / ruby / perl / R comments
    .replace(/\/\/.*/g, "") // JS/TS/Java/C++ line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // block comments
  if (key === "lua" || key === "haskell") stripped = stripped.replace(/--.*/g, "");
  if (key === "clojure") stripped = stripped.replace(/;.*/g, "");

  const patterns: Record<string, RegExp[]> = {
    python: [/\binput\s*\(/, /\bsys\.stdin\b/],
    javascript: [/readline\s*\(/, /process\.stdin/, /createInterface\s*\(/],
    typescript: [/readline\s*\(/, /process\.stdin/, /createInterface\s*\(/],
    c: [/\bscanf\s*\(/, /\bfgets\s*\(/, /\bgets\s*\(/, /\bfscanf\s*\(\s*stdin/, /\b(?:f?getc|getchar)\s*\(/],
    cpp: [/\bscanf\s*\(/, /\bcin\s*(?:>>|\.)/, /\bgetline\s*\(/, /\bgetchar\s*\(/, /\bfgets\s*\(/],
    "c++": [/\bscanf\s*\(/, /\bcin\s*(?:>>|\.)/, /\bgetline\s*\(/, /\bgetchar\s*\(/, /\bfgets\s*\(/],
    java: [/\bScanner\b/, /\bBufferedReader\b/, /System\.in/],
    rust: [/read_line\s*\(/, /std::io::stdin/, /\bio::stdin\b/],
    ruby: [/\bgets\b/, /\breadline\b/, /\$stdin/, /\bSTDIN\b/, /\bARGF\b/],
    go: [/fmt\.Scan/, /bufio\.NewScanner/, /\bos\.Stdin\b/],
    r: [/\breadLines\b/, /\bscan\b/, /\breadline\b/],
    php: [/\bfgets\s*\(\s*STDIN/, /\bfscanf\s*\(\s*STDIN/, /\breadline\s*\(/, /php:\/\/stdin/, /\bSTDIN\b/],
    swift: [/\breadLine\s*\(/],
    csharp: [/Console\.(?:ReadLine|Read|ReadKey)\s*\(/, /Console\.In\b/],
    kotlin: [/\breadLine\s*\(/, /\breadln\s*\(/, /\breadlnOrNull\s*\(/, /System\.`?in`?/, /\bScanner\b/],
    bash: [/(?:^|[;&|\s])read\s+(?:-\w+\s+)*[\w$]+/m, /\bcat\s+-(?:\s|$)/m],
    lua: [/\bio\.read\s*\(/, /\bio\.lines\s*\(/, /\bio\.stdin\b/],
    perl: [/<STDIN>/, /\bSTDIN\b/, /<>/],
    scala: [/\bStdIn\b/, /\breadLine\s*\(/, /\breadInt\s*\(/, /\bScanner\b/, /\bscala\.io\.StdIn\b/],
    haskell: [/\bgetLine\b/, /\bgetContents\b/, /\binteract\b/, /\breadLn\b/],
    clojure: [/\bread-line\b/, /\*in\*/, /\(read\)/],
    dart: [/\bstdin\./],
    elixir: [/\bIO\.(?:gets|read|binread)\b/],
    nim: [/\breadLine\s*\(/, /\bstdin\b/, /\breadAll\s*\(/],
  };

  const langPatterns = patterns[key] ?? [];
  return langPatterns.some((p) => p.test(stripped));
}
