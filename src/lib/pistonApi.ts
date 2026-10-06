// ============================================
// Zuup Code — Piston Code Execution Engine
// Proxied through /api/execute to avoid CORS
// ============================================

// Language → Piston runtime mapping (from emkc.org/api/v2/piston/runtimes)
const LANG_CONFIG: Record<string, { language: string; version: string }> = {
  python:     { language: "python",      version: "3.10.0" },
  javascript: { language: "javascript",  version: "18.15.0" },
  typescript: { language: "typescript",  version: "5.0.3" },
  java:       { language: "java",        version: "15.0.2" },
  c:          { language: "c",           version: "10.2.0" },
  "c++":      { language: "c++",         version: "10.2.0" },
  cpp:        { language: "c++",         version: "10.2.0" },
  go:         { language: "go",          version: "1.16.2" },
  rust:       { language: "rust",        version: "1.68.2" },
  php:        { language: "php",         version: "8.2.3" },
  ruby:       { language: "ruby",        version: "3.0.1" },
  swift:      { language: "swift",       version: "5.3.3" },
  csharp:     { language: "csharp",      version: "6.12.0" },
  kotlin:     { language: "kotlin",      version: "1.8.20" },
  bash:       { language: "bash",        version: "5.2.0" },
  lua:        { language: "lua",         version: "5.4.4" },
  perl:       { language: "perl",        version: "5.36.0" },
  r:          { language: "rscript",     version: "4.1.1" },
  scala:      { language: "scala",       version: "3.2.2" },
  haskell:    { language: "haskell",     version: "9.0.1" },
  clojure:    { language: "clojure",     version: "1.10.3" },
  dart:       { language: "dart",        version: "2.19.6" },
  elixir:     { language: "elixir",      version: "1.11.3" },
  nim:        { language: "nim",         version: "1.6.2" },
};

// ── Main entry ─────────────────────────────────────────
export async function executeCode(
  language: string,
  _version: string,
  code: string,
  stdin?: string
): Promise<{ output: string[]; success: boolean }> {
  const lang = language.toLowerCase();
  const config = LANG_CONFIG[lang];

  if (!config) {
    return {
      output: [
        `❌ Language "${language}" is not supported for execution.`,
        "",
        `✅ Supported: ${Object.keys(LANG_CONFIG).join(", ")}`
      ],
      success: false,
    };
  }

  try {
    // Call our proxy at /api/execute (avoids CORS)
    // In dev: Vite proxies this to emkc.org with auth header
    // In prod: a serverless function handles it
    const response = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: config.language,
        version: config.version,
        files: [{ content: code }],
        ...(stdin !== undefined ? { stdin } : {}),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Piston returned ${response.status}:`, errBody);
      return {
        output: [
          `❌ Execution service returned status ${response.status}.`,
          errBody ? errBody.slice(0, 300) : "No details available.",
        ],
        success: false,
      };
    }

    const result = await response.json();
    const output: string[] = [];
    let success = true;

    // Compile stage errors
    if (result.compile?.stderr) {
      output.push(result.compile.stderr.trim());
      success = false;
    }
    // Run stage
    if (result.run?.stdout) output.push(result.run.stdout.trim());
    if (result.run?.stderr) {
      output.push(result.run.stderr.trim());
      success = false;
    }
    if (result.run?.code !== 0 && result.run?.code !== null) success = false;
    if (output.length === 0) output.push("✅ Code executed successfully with no output.");

    return { output, success };
  } catch (err: unknown) {
    console.error("Execution error:", err);
    return {
      output: [
        "❌ Failed to reach code execution service.",
        "",
        "🔧 Check your internet connection and try again.",
        err instanceof Error && err.message ? `Details: ${err.message}` : "",
      ].filter(Boolean),
      success: false,
    };
  }
}
