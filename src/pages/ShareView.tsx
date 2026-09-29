import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getShare, type CodeShare } from "@/lib/shareStorage";
import { decodeData } from "@/lib/sharing";
import { executeCode } from "@/lib/pistonApi";
import { getLanguageById } from "@/lib/languages";
import Editor from "@monaco-editor/react";
import {
  Loader2,
  FileCode,
  FolderOpen,
  Eye,
  Clock,
  Copy,
  Check,
  Code2,
  Download,
  Play,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Terminal as TerminalIcon,
  X,
  Share2,
} from "lucide-react";
import { copyToClipboard, downloadFile } from "@/lib/fileSystem";

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
  const [copied, setCopied] = useState(false);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[] | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

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
              title: decoded.name || "Shared Project",
              language: decoded.files[0]?.language || "python",
              files: decoded.files.map((f: any) => ({
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
              title: decoded.fileName || "Shared File",
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
    await copyToClipboard(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    const file = share.files[activeFileIndex];
    const lang = getLanguageById(file.language);

    if (!lang.pistonLang) {
      setTerminalOutput([`⚠️ No runner available for ${file.language}.`]);
      setShowTerminal(true);
      return;
    }

    setIsRunning(true);
    setShowTerminal(true);
    setTerminalOutput([`▶ Executing ${file.name} with ${lang.label} runtime...`]);

    try {
      const result = await executeCode(lang.pistonLang, lang.pistonVersion, file.content);
      const out = [
        ...result.output,
        result.success ? "✅ Execution finished successfully." : "❌ Execution finished with errors.",
      ];
      setTerminalOutput(out);
    } catch (err: any) {
      setTerminalOutput([`❌ Execution error: ${err?.message || "Failed to reach execution server"}`]);
    } finally {
      setIsRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f17] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">Loading shared code...</p>
        </div>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="min-h-screen bg-[#0d0f17] text-foreground flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-4">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <FileCode size={28} className="text-destructive" />
          </div>
          <h1 className="text-xl font-bold">Share Not Found</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This code link may have expired or does not exist. You can start a new project in Zuup Code.
          </p>
          <Link
            to="/editor"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:brightness-110 transition-all glow-primary-sm"
          >
            Open Zuup Code IDE
          </Link>
        </div>
      </div>
    );
  }

  const activeFile = share.files[activeFileIndex] || share.files[0];
  const isProject = share.files.length > 1;

  return (
    <div className="min-h-screen bg-[#0d0f17] text-foreground flex flex-col font-sans">
      {/* ─── Top Promotional Banner ─── */}
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary animate-pulse" />
          <span className="text-muted-foreground">
            Viewing shared code on <strong className="text-foreground">Zuup Code</strong> — The Instant Cloud IDE with 20+ Languages.
          </span>
        </div>
        <Link
          to="/login"
          className="hidden md:inline-flex items-center gap-1 font-semibold text-primary hover:underline ml-2"
        >
          Sign In with Zuup <ExternalLink size={11} />
        </Link>
      </div>

      {/* ─── Navigation Header ─── */}
      <header className="h-13 border-b border-border/60 bg-[#0a0c13] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={LOGO} alt="Zuup" className="h-6 w-6 rounded group-hover:scale-105 transition-transform" />
            <div className="flex items-center gap-0.5">
              <span className="text-sm font-bold text-foreground">Zuup</span>
              <span className="text-sm font-light text-primary">Code</span>
            </div>
          </Link>

          <span className="text-muted-foreground/30 text-xs">/</span>

          <div className="flex items-center gap-2">
            {isProject ? <FolderOpen size={14} className="text-primary" /> : <FileCode size={14} className="text-primary" />}
            <span className="text-sm font-semibold truncate max-w-[240px]">{share.title}</span>
            <span className="rounded-md bg-secondary/80 border border-border/50 px-2 py-0.5 text-[10px] font-mono text-primary uppercase">
              {share.type}
            </span>
            <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              Read-Only
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1.5 rounded-lg bg-secondary/80 border border-border/60 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary hover:text-primary transition-all cursor-pointer"
            title="Run code online without leaving"
          >
            {isRunning ? (
              <Loader2 size={12} className="animate-spin text-primary" />
            ) : (
              <Play size={12} className="text-green-400 fill-green-400" />
            )}
            <span>{isRunning ? "Running..." : "Run"}</span>
          </button>

          {/* Copy code */}
          <button
            onClick={handleCopy}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title="Copy code to clipboard"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Download file */}
          <button
            onClick={handleDownload}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title="Download file"
          >
            <Download size={13} />
            <span>Download</span>
          </button>

          {/* Fork / Open in IDE button (Primary CTA) */}
          <button
            onClick={handleFork}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110 transition-all glow-primary-sm"
            title="Fork this code and start editing in Zuup Code IDE"
          >
            <Code2 size={13} />
            <span>Fork in IDE</span>
          </button>
        </div>
      </header>

      {/* ─── Main Workspace Area ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Project Files Sidebar (if multi-file) */}
        {isProject && (
          <aside className="w-56 border-r border-border/60 bg-[#0a0c13] shrink-0 overflow-y-auto select-none">
            <div className="px-3 py-2.5 border-b border-border/40">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Files ({share.files.length})
              </span>
            </div>
            <div className="p-2 space-y-1">
              {share.files.map((file, i) => (
                <button
                  key={`${file.name}-${i}`}
                  onClick={() => setActiveFileIndex(i)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-mono transition-all text-left ${
                    i === activeFileIndex
                      ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/40 glow-primary-sm"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <FileCode size={13} className={i === activeFileIndex ? "text-primary" : "text-muted-foreground"} />
                  <span className="truncate flex-1">{file.name}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Read-Only Monaco Editor */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0d0f17]">
          {/* File Tab Info Bar */}
          <div className="flex items-center justify-between h-9 px-4 border-b border-border/40 bg-[#0a0c13] shrink-0 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileCode size={13} className="text-primary" />
              <span className="font-mono text-foreground font-medium">{activeFile.name}</span>
              <span className="text-border">·</span>
              <span className="capitalize">{activeFile.language}</span>
              <span className="text-border">·</span>
              <span>{(activeFile.content.length / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase font-mono tracking-wider text-muted-foreground/60">
              🔒 Read-Only Showcase
            </div>
          </div>

          {/* Monaco Editor Component */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={getMonacoLang(activeFile.language)}
              value={activeFile.content}
              theme="vs-dark"
              loading={
                <div className="flex h-full items-center justify-center bg-[#0d0f17]">
                  <Loader2 size={24} className="text-primary animate-spin" />
                </div>
              }
              options={{
                readOnly: true,
                domReadOnly: true,
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: true },
                smoothScrolling: true,
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                bracketPairColorization: { enabled: true },
                wordWrap: "on",
                lineNumbers: "on",
                renderLineHighlight: "all",
              }}
            />
          </div>

          {/* Collapsible Execution Terminal */}
          {showTerminal && (
            <div className="border-t border-border/60 bg-[#090b12] flex flex-col max-h-60 shrink-0">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-secondary/20">
                <div className="flex items-center gap-2 text-xs font-mono font-medium text-foreground">
                  <TerminalIcon size={12} className="text-primary" />
                  <span>Terminal Output</span>
                </div>
                <button
                  onClick={() => setShowTerminal(false)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="p-3 font-mono text-xs overflow-y-auto space-y-1 max-h-48 text-muted-foreground">
                {terminalOutput?.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.startsWith("❌")
                        ? "text-destructive font-medium"
                        : line.startsWith("✅")
                        ? "text-green-400 font-medium"
                        : line.startsWith("▶")
                        ? "text-primary"
                        : "text-foreground/90"
                    }
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ─── Bottom Promotion Footer ─── */}
      <footer className="border-t border-border/60 bg-[#080a10] px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Share2 size={13} className="text-primary" />
          <span>Want to build and run your own projects with cloud saving & collaboration?</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/editor"
            className="text-primary font-semibold hover:underline flex items-center gap-1"
          >
            Launch Zuup Code IDE →
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default ShareView;
