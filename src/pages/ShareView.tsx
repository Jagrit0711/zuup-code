import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getShare, type CodeShare } from "@/lib/shareStorage";
import { decodeData } from "@/lib/sharing";
import { executeCode, type ExecutionResult } from "@/lib/pistonApi";
import { detectNeedsStdin, getLanguageById } from "@/lib/languages";
import { runResultToLines, summarizeRun } from "@/lib/run/format";
import { ZUUP_THEME, ZUUP_THEME_DATA } from "@/lib/editor/theme";
import Editor from "@monaco-editor/react";
import { Copy, Download, Play, Square, X } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard, downloadFile } from "@/lib/fileSystem";
import IconButton from "@/components/ide/panel/IconButton";
import { fileGlyph } from "@/components/ide/panel/fileGlyph";
import { cn } from "@/lib/utils";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

// Map language IDs to Monaco language IDs
function getMonacoLang(lang: string): string {
  const map: Record<string, string> = {
    python: "python",
    javascript: "javascript",
    typescript: "typescript",
    html: "html",
    css: "css",
    java: "java",
    c: "c",
    cpp: "cpp",
    go: "go",
    rust: "rust",
    ruby: "ruby",
    php: "php",
    swift: "swift",
    kotlin: "kotlin",
    dart: "dart",
    r: "r",
    sql: "sql",
    lua: "lua",
    bash: "shell",
    shell: "shell",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    markdown: "markdown",
    plaintext: "plaintext",
  };
  return map[lang.toLowerCase()] || "plaintext";
}
const ShareView = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();

  const [share, setShare] = useState<CodeShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [runNote, setRunNote] = useState("");
  const [showOutput, setShowOutput] = useState(false);
  const [stdin, setStdin] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Stop an in-flight run when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    async function loadShareData() {
      if (!shareId) {
        setError(true);
        setLoading(false);
        return;
      }

      // 1. Try Supabase DB lookup
      const data = await getShare(shareId);
      if (data) {
        setShare(data);
        setLoading(false);
        return;
      }

      // 2. Fallback: Try decoding as base64 URL payload
      try {
        const decoded = decodeData(shareId);
        if (decoded) {
          if (decoded.files && Array.isArray(decoded.files)) {
            // Project share
            const projectShare: CodeShare = {
              id: shareId,
              type: "project",
              title: decoded.name || "Shared project",
              language: decoded.files[0]?.language || "python",
              files: decoded.files.map((f: { fileName?: string; name?: string; language?: string; code?: string; content?: string }) => ({
                name: f.fileName || f.name,
                language: f.language || "python",
                content: f.code || f.content || "",
              })),
              created_by: null,
              views: 1,
              created_at: new Date().toISOString(),
            };
            setShare(projectShare);
            setLoading(false);
            return;
          } else if (decoded.code !== undefined) {
            // Single file share
            const fileShare: CodeShare = {
              id: shareId,
              type: "file",
              title: decoded.fileName || "Shared file",
              language: decoded.language || "python",
              files: [
                {
                  name: decoded.fileName || "main.py",
                  language: decoded.language || "python",
                  content: decoded.code || "",
                },
              ],
              created_by: null,
              views: 1,
              created_at: new Date().toISOString(),
            };
            setShare(fileShare);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Base64 decode fallback failed:", err);
      }

      setError(true);
      setLoading(false);
    }

    loadShareData();
  }, [shareId]);

  const handleCopy = async () => {
    if (!share) return;
    const file = share.files[activeFileIndex];
    try {
      await copyToClipboard(file.content);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy. Select the code and copy it instead.");
    }
  };

  const handleDownload = () => {
    if (!share) return;
    const file = share.files[activeFileIndex];
    downloadFile(file.name, file.content);
  };

  const handleFork = () => {
    if (!share) return;
    try {
      localStorage.setItem(
        "zuup_fork_project",
        JSON.stringify({
          name: `${share.title} (Fork)`,
          files: share.files.map((f) => ({
            fileName: f.name,
            language: f.language,
            code: f.content,
          })),
        })
      );
    } catch (e) {
      console.error("Failed to store fork data:", e);
    }
    navigate("/editor?fork=true");
  };
  const handleRun = async () => {
    if (!share) return;
    if (isRunning) {
      abortRef.current?.abort();
      return;
    }
    const file = share.files[activeFileIndex];
    const lang = getLanguageById(file.language);
    setShowOutput(true);

    if (!lang.pistonLang) {
      setResult(null);
      setRunNote(
        lang.id === "html" || lang.id === "css"
          ? `${lang.label} runs in the browser preview. Open it in the editor to see the page.`
          : `${lang.label} can't be run here.`
      );
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setResult(null);
    setRunNote(`Running ${file.name}`);
    try {
      const next = await executeCode(lang.pistonLang, lang.pistonVersion, file.content, stdin || undefined, {
        signal: controller.signal,
        fileName: file.name,
      });
      if (abortRef.current === controller) {
        setResult(next);
        setRunNote("");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsRunning(false);
      }
    }
  };

  // Clear output when switching files
  useEffect(() => {
    setResult(null);
    setRunNote("");
  }, [activeFileIndex]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <p className="text-[13px] text-muted-foreground" role="status">
          Loading shared code
        </p>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="flex min-h-screen items-center bg-ink px-4 text-foreground">
        <div className="mx-auto w-full max-w-md">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">This link has no code behind it</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            The share may have been removed, or the link was copied only in part. Ask the person who sent it for a
            new link, or start your own project.
          </p>
          <Link
            to="/editor"
            className="mt-6 inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Open Zuup Code
          </Link>
        </div>
      </div>
    );
  }

  const activeFile = share.files[activeFileIndex] || share.files[0];
  const isProject = share.files.length > 1;
  const activeLang = getLanguageById(activeFile.language);
  const needsInput = !!activeLang.pistonLang && detectNeedsStdin(activeFile.content, activeLang.id);
  const lineCount = activeFile.content.split("\n").length;
  const summary = result ? summarizeRun(result) : null;
  const outputLines = result ? runResultToLines(result).slice(0, -1) : [];
  // Drop the trailing blank line that separates output from the summary; the summary lives in the header here.
  if (outputLines.length && outputLines[outputLines.length - 1].text === "") outputLines.pop();

  const summaryClass =
    summary?.type === "success" ? "text-success" : summary?.type === "warning" ? "text-warning" : "text-danger";

  return (
    <div className="flex h-screen flex-col bg-ink font-sans text-foreground">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-rule bg-panel px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <img src={LOGO} alt="" className="h-5 w-5 rounded" />
            <span className="text-[13px] font-semibold">Zuup Code</span>
          </Link>
          <span className="text-faint" aria-hidden>
            /
          </span>
          <h1 className="min-w-0 truncate text-[13px] font-medium" title={share.title}>
            {share.title}
          </h1>
          <span className="hidden shrink-0 text-[12px] text-faint sm:inline">Read only</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Copy code" side="bottom" onClick={handleCopy} className="hidden sm:inline-flex">
            <Copy size={14} />
          </IconButton>
          <IconButton label="Download file" side="bottom" onClick={handleDownload} className="hidden sm:inline-flex">
            <Download size={14} />
          </IconButton>
          <button
            type="button"
            onClick={handleFork}
            className="ml-1 h-8 rounded-md border border-rule px-3 text-[13px] text-foreground transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            Edit a copy
          </button>
          <button
            type="button"
            onClick={handleRun}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            {isRunning ? (
              <Square size={10} className="fill-current" aria-hidden />
            ) : (
              <Play size={12} className="fill-current" aria-hidden />
            )}
            {isRunning ? "Stop" : "Run"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* File list for multi-file shares */}
        {isProject && (
          <aside className="hidden w-56 shrink-0 flex-col border-r border-rule bg-panel md:flex">
            <h2 className="flex h-9 shrink-0 items-center px-3 text-[12px] font-semibold text-muted-foreground">
              Files<span className="ml-1.5 font-normal tabular-nums text-faint">{share.files.length}</span>
            </h2>
            <nav className="flex-1 overflow-y-auto pb-2" aria-label="Files">
              {share.files.map((file, i) => {
                const Glyph = fileGlyph(file.name);
                const active = i === activeFileIndex;
                return (
                  <button
                    type="button"
                    key={`${file.name}-${i}`}
                    onClick={() => setActiveFileIndex(i)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-[22px] w-full items-center gap-1.5 px-3 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
                      active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised/70 hover:text-foreground"
                    )}
                  >
                    <Glyph size={14} aria-hidden className={active ? "text-muted-foreground" : "text-faint"} />
                    <span className="truncate">{file.name}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {/* File bar */}
          <div className="flex h-8 shrink-0 items-center gap-4 border-b border-rule px-3 text-[12px]">
            {isProject ? (
              <select
                value={activeFileIndex}
                onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                aria-label="File"
                className="h-6 rounded-md border border-rule bg-ink px-1.5 font-mono text-[12px] text-foreground md:hidden"
              >
                {share.files.map((f, i) => (
                  <option key={i} value={i}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : null}
            <span className={cn("truncate font-mono text-foreground", isProject && "hidden md:inline")}>
              {activeFile.name}
            </span>
            <span className="text-muted-foreground">{activeLang.label}</span>
            <span className="hidden text-faint sm:inline">
              {lineCount} {lineCount === 1 ? "line" : "lines"}
            </span>
          </div>

          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              language={getMonacoLang(activeFile.language)}
              value={activeFile.content}
              theme={ZUUP_THEME}
              beforeMount={(monaco) => monaco.editor.defineTheme(ZUUP_THEME, ZUUP_THEME_DATA)}
              loading={<div className="h-full bg-ink" />}
              options={{
                readOnly: true,
                domReadOnly: true,
                fontSize: 13.5,
                lineHeight: 21,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontLigatures: false,
                minimap: { enabled: false },
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
              }}
            />
          </div>

          {/* Program input, for code that reads from the keyboard */}
          {needsInput && (
            <div className="shrink-0 border-t border-rule px-3 py-2">
              <label htmlFor="share-stdin" className="text-[12px] font-semibold text-muted-foreground">
                Program input
              </label>
              <p className="text-[12px] text-faint">This program reads input. Put one value per line, then run.</p>
              <textarea
                id="share-stdin"
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                rows={2}
                spellCheck={false}
                className="mt-1.5 w-full resize-y rounded-md border border-rule bg-ink px-2.5 py-1.5 font-mono text-[12.5px] text-foreground placeholder:text-faint focus-visible:border-primary/60 focus-visible:outline-none"
                placeholder={"5\n10"}
              />
            </div>
          )}

          {/* Output */}
          {showOutput && (
            <section aria-label="Output" className="flex max-h-[40%] min-h-[120px] shrink-0 flex-col border-t border-rule">
              <div className="flex h-8 shrink-0 items-center justify-between gap-3 pl-3 pr-1.5">
                <div className="flex min-w-0 items-center gap-3 text-[12px]">
                  <h2 className="font-semibold text-muted-foreground">Output</h2>
                  <span role="status" className="truncate">
                    {isRunning ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" />
                        Running
                      </span>
                    ) : summary ? (
                      <span className={summaryClass}>{summary.text}</span>
                    ) : null}
                  </span>
                </div>
                <IconButton
                  label="Close output"
                  onClick={() => {
                    abortRef.current?.abort();
                    setShowOutput(false);
                  }}
                >
                  <X size={14} />
                </IconButton>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 font-mono text-[12.5px] leading-[1.6]">
                {runNote && <p className="font-sans text-[13px] text-muted-foreground">{runNote}</p>}
                {outputLines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap break-words",
                      line.type === "error"
                        ? "text-danger"
                        : line.type === "info"
                          ? "font-sans text-[13px] text-muted-foreground"
                          : "text-foreground/85"
                    )}
                  >
                    {line.text || " "}
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-rule bg-panel px-3 text-[12px] text-muted-foreground">
        <span className="truncate">Shared from Zuup Code, a free code editor for students.</span>
        <Link
          to="/editor"
          className="shrink-0 rounded text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          Start your own project
        </Link>
      </footer>
    </div>
  );
};

export default ShareView;
