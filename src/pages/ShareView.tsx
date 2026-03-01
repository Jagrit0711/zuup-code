import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getShare, type CodeShare } from "@/lib/shareStorage";
import Editor from "@monaco-editor/react";
import {
  Loader2, FileCode, FolderOpen, Eye, Clock, Copy, Check, Code2, Download, ArrowLeft,
} from "lucide-react";
import { copyToClipboard, downloadFile } from "@/lib/fileSystem";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

// Map language IDs to Monaco language IDs
function getMonacoLang(lang: string): string {
  const map: Record<string, string> = {
    python: "python", javascript: "javascript", typescript: "typescript",
    html: "html", css: "css", java: "java", c: "c", cpp: "cpp",
    go: "go", rust: "rust", ruby: "ruby", php: "php", swift: "swift",
    kotlin: "kotlin", dart: "dart", r: "r", sql: "sql", lua: "lua",
    bash: "shell", shell: "shell", json: "json", xml: "xml",
    yaml: "yaml", markdown: "markdown", plaintext: "plaintext",
  };
  return map[lang] || "plaintext";
}

const ShareView = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [share, setShare] = useState<CodeShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shareId) {
      setError(true);
      setLoading(false);
      return;
    }

    getShare(shareId).then((data) => {
      if (data) {
        setShare(data);
      } else {
        setError(true);
      }
      setLoading(false);
    });
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

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading shared code...</p>
        </div>
      </div>
    );
  }

  // Error / not found
  if (error || !share) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <FileCode size={24} className="text-destructive" />
          </div>
          <h1 className="text-xl font-bold">Share not found</h1>
          <p className="text-sm text-muted-foreground">
            This share link may have been deleted or doesn't exist.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Zuup Code
          </Link>
        </div>
      </div>
    );
  }

  const activeFile = share.files[activeFileIndex];
  const isProject = share.type === "project" && share.files.length > 1;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ─── Top Bar ─── */}
      <nav className="border-b border-border/40 glass-strong sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-1.5 group">
              <img src={LOGO} alt="Zuup" className="h-5 w-5 rounded group-hover:scale-110 transition-transform" />
              <span className="text-sm font-bold">Zuup</span>
              <span className="text-sm font-light text-primary">Code</span>
            </Link>

            <span className="text-muted-foreground/30 text-xs">/</span>

            <div className="flex items-center gap-2">
              {isProject ? <FolderOpen size={14} className="text-primary" /> : <FileCode size={14} className="text-primary" />}
              <span className="text-sm font-medium truncate max-w-[300px]">{share.title}</span>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {isProject ? "PROJECT" : "FILE"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground mr-3">
              <span className="flex items-center gap-1"><Eye size={11} /> {share.views + 1} views</span>
              <span className="flex items-center gap-1"><Clock size={11} /> {new Date(share.created_at).toLocaleDateString()}</span>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            >
              <Download size={12} />
              Download
            </button>

            <Link
              to="/editor"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:brightness-110 transition-all"
            >
              <Code2 size={12} />
              Open Editor
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Body ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tabs / sidebar for projects */}
        {isProject && (
          <div className="w-52 border-r border-border/40 glass-strong shrink-0 overflow-y-auto">
            <div className="px-3 py-2.5 border-b border-border/30">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Files ({share.files.length})
              </span>
            </div>
            <div className="p-2 space-y-0.5">
              {share.files.map((file, i) => (
                <button
                  key={`${file.name}-${i}`}
                  onClick={() => setActiveFileIndex(i)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-mono transition-all ${
                    i === activeFileIndex
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <FileCode size={11} />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Editor (read-only) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* File name bar */}
          <div className="flex items-center justify-between h-9 px-4 border-b border-border/30 bg-secondary/10 shrink-0">
            <div className="flex items-center gap-2 text-[11px]">
              <FileCode size={11} className="text-primary" />
              <span className="font-mono text-foreground">{activeFile.name}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{activeFile.language}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{(activeFile.content.length / 1024).toFixed(1)} KB</span>
            </div>
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Read Only</span>
          </div>

          {/* Monaco Editor - read only */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={getMonacoLang(activeFile.language)}
              value={activeFile.content}
              theme="vs-dark"
              loading={
                <div className="flex h-full items-center justify-center bg-background">
                  <Loader2 size={20} className="text-primary animate-spin" />
                </div>
              }
              options={{
                readOnly: true,
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: true },
                smoothScrolling: true,
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                renderLineHighlight: "all",
                bracketPairColorization: { enabled: true },
                wordWrap: "on",
                domReadOnly: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareView;
