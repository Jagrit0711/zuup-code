import {
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";

// ─── Virtual Filesystem ────────────────────────────────────────────────────────
interface VFile {
  name: string;
  content: string;
  type: "file" | "dir";
}

function buildFS(): Record<string, VFile> {
  return {
    "/": { name: "/", content: "", type: "dir" },
    "/home": { name: "home", content: "", type: "dir" },
    "/home/user": { name: "user", content: "", type: "dir" },
  };
}

// ─── Terminal Line Types ───────────────────────────────────────────────────────
type LineType = "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt";

interface TermLine {
  text: string;
  type: LineType;
}

// ─── Simulated package install delay ──────────────────────────────────────────
async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Detect if code needs interactive stdin ────────────────────────────────────
function detectNeedsStdin(code: string, lang: string): boolean {
  if (!code) return false;
  // Strip single-line comments to avoid false positives
  const stripped = code
    .replace(/#.*/g, "")           // Python / bash comments
    .replace(/\/\/.*/g, "")        // JS/TS/Java/C++ line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // block comments

  const patterns: Record<string, RegExp[]> = {
    python:     [/\binput\s*\(/],
    javascript: [/readline\s*\(/, /process\.stdin/, /createInterface\s*\(/],
    typescript: [/readline\s*\(/, /process\.stdin/, /createInterface\s*\(/],
    c:          [/\bscanf\s*\(/, /\bfgets\s*\(/, /\bgetchar\s*\(/],
    cpp:        [/\bscanf\s*\(/, /\bcin\s*>>/, /\bgetline\s*\(/, /\bgetchar\s*\(/],
    java:       [/\bScanner\b/, /\bBufferedReader\b/, /System\.in/],
    rust:       [/read_line\s*\(/, /std::io::stdin/],
    ruby:       [/\bgets\b/, /\breadline\b/, /\$stdin/],
    go:         [/fmt\.Scan/, /bufio\.NewScanner/],
    r:          [/\breadLines\b/, /\bscan\b/, /\breadline\b/],
  };

  const langPatterns = patterns[lang] ?? [];
  return langPatterns.some((p) => p.test(stripped));
}

interface TerminalProps {
  onClear: () => void;
  onCommand: (cmd: string, stdin?: string) => void;
  isRunning: boolean;
  // Active file info so terminal can detect stdin needs
  fileContent?: string;
  fileLang?: string;
  // Lets parent push execution results directly into terminal lines
  externalLines?: TermLine[];
}

const TerminalPanel = ({
  onClear,
  onCommand,
  isRunning,
  fileContent = "",
  fileLang = "",
  externalLines,
}: TerminalProps) => {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Virtual filesystem state
  const [fs, setFs] = useState<Record<string, VFile>>(buildFS());
  const [cwd, setCwd] = useState("/home/user");

  // Terminal display lines
  const [lines, setLines] = useState<TermLine[]>([
    { text: "Zuup Code Terminal v2.0 — Enhanced Shell", type: "success" },
    { text: "Type 'help' to see available commands.", type: "info" },
    { text: "", type: "output" },
  ]);

  // Stdin collection mode: when a program needs input
  const [stdinMode, setStdinMode] = useState(false);
  const [stdinBuffer, setStdinBuffer] = useState<string[]>([]);
  const [stdinPromptText, setStdinPromptText] = useState(">");
  const [pendingCode, setPendingCode] = useState<{ code: string; lang: string } | null>(null);

  // Package install simulation
  const [isInstalling, setIsInstalling] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fsRef = useRef(fs);
  const cwdRef = useRef(cwd);
  useEffect(() => { fsRef.current = fs; }, [fs]);
  useEffect(() => { cwdRef.current = cwd; }, [cwd]);

  // Auto-scroll
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // Auto-refocus input after execution finishes
  useEffect(() => {
    if (!isRunning && !isInstalling && inputRef.current) {
      // Small delay so the disabled state clears first
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isRunning, isInstalling]);

  // Receive external output lines (e.g. after code execution)
  useEffect(() => {
    if (externalLines && externalLines.length > 0) {
      setLines((prev) => [...prev, ...externalLines, { text: "", type: "output" }]);
    }
  }, [externalLines]);

  const pushLines = useCallback((...newLines: TermLine[]) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  // ─── Path helpers ────────────────────────────────────────────────────────────
  function resolvePath(target: string, base: string): string {
    if (target.startsWith("/")) return normPath(target);
    if (target === "..") {
      const parts = base.split("/").filter(Boolean);
      parts.pop();
      return "/" + parts.join("/") || "/";
    }
    if (target === ".") return base;
    return normPath(base + "/" + target);
  }

  function normPath(p: string): string {
    const parts = p.split("/").filter(Boolean);
    return "/" + parts.join("/");
  }

  function basename(p: string): string {
    return p.split("/").filter(Boolean).pop() || p;
  }

  function listDir(path: string, currentFs: Record<string, VFile>): VFile[] {
    const normaled = normPath(path) || "/";
    return Object.entries(currentFs)
      .filter(([k, v]) => {
        if (k === normaled) return false;
        const parent = k.split("/").slice(0, -1).join("/") || "/";
        return parent === normaled;
      })
      .map(([, v]) => v);
  }

  // ─── Download a virtual file ──────────────────────────────────────────────
  function downloadVFile(name: string, content: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      csv: "text/csv",
      json: "application/json",
      html: "text/html",
      md: "text/markdown",
    };
    const mime = mimeMap[ext || ""] || "text/plain";
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Simulated package install ────────────────────────────────────────────
  async function simulateInstall(manager: string, packages: string[]) {
    setIsInstalling(true);
    const pkgList = packages.join(" ");

    if (manager === "pip") {
      pushLines(
        { text: `Collecting ${pkgList}`, type: "output" },
      );
      await delay(600);
      for (const pkg of packages) {
        pushLines({ text: `  Downloading ${pkg}-latest.tar.gz`, type: "output" });
        await delay(400);
      }
      pushLines(
        { text: `Installing collected packages: ${pkgList}`, type: "output" },
      );
      await delay(500);
      pushLines(
        { text: `Successfully installed ${pkgList}`, type: "success" },
        { text: "", type: "output" },
      );
    } else if (manager === "npm" || manager === "yarn" || manager === "bun") {
      pushLines({ text: `${manager} install ${pkgList}`, type: "output" });
      await delay(300);
      for (const pkg of packages) {
        pushLines({ text: `  + ${pkg}`, type: "output" });
        await delay(200);
      }
      pushLines(
        { text: `added ${packages.length} package(s)`, type: "success" },
        { text: "", type: "output" },
      );
    } else {
      pushLines(
        { text: `${manager}: installing ${pkgList}...`, type: "output" },
      );
      await delay(500);
      pushLines(
        { text: `✓ Done!`, type: "success" },
        { text: "", type: "output" },
      );
    }
    setIsInstalling(false);
  }

  // ─── Core command processor ───────────────────────────────────────────────
  async function processCommand(rawCmd: string) {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    // Add to history
    setHistory((prev) => {
      const deduped = prev.filter((h) => h !== trimmed);
      return [...deduped, trimmed];
    });
    setHistoryIndex(-1);

    // Echo the prompt line
    pushLines({ text: `${cwdRef.current} $ ${trimmed}`, type: "prompt" });

    const currentFs = fsRef.current;
    const currentCwd = cwdRef.current;

    // Split with quote awareness
    const args = shellSplit(trimmed);
    const cmd = args[0]?.toLowerCase() || "";

    // ── built-ins ────────────────────────────────────────────────────────────
    if (cmd === "clear" || cmd === "cls") {
      setLines([]);
      return;
    }

    if (cmd === "help") {
      pushLines(
        { text: "─── File System ───────────────────────────────", type: "info" },
        { text: "  ls [path]              List directory contents", type: "output" },
        { text: "  pwd                    Print working directory", type: "output" },
        { text: "  cd <path>              Change directory", type: "output" },
        { text: "  mkdir <name>           Create a directory", type: "output" },
        { text: "  touch <name>           Create an empty file", type: "output" },
        { text: "  cat <file>             Show file contents", type: "output" },
        { text: "  echo <text> > <file>   Write text to file", type: "output" },
        { text: "  rm <file>              Remove a file/directory", type: "output" },
        { text: "  cp <src> <dst>         Copy file", type: "output" },
        { text: "  mv <src> <dst>         Move/rename file", type: "output" },
        { text: "  write <file>           Enter multi-line write mode (end with EOF)", type: "output" },
        { text: "  download <file>        Download a virtual file to your computer", type: "output" },
        { text: "  csv <file>             Create a sample CSV file", type: "output" },
        { text: "", type: "output" },
        { text: "─── Packages ──────────────────────────────────", type: "info" },
        { text: "  pip install <pkg>      Install Python package (simulated)", type: "output" },
        { text: "  npm install <pkg>      Install Node package (simulated)", type: "output" },
        { text: "  yarn add <pkg>         Install with Yarn (simulated)", type: "output" },
        { text: "  bun add <pkg>          Install with Bun (simulated)", type: "output" },
        { text: "", type: "output" },
        { text: "─── Utilities ─────────────────────────────────", type: "info" },
        { text: "  echo <text>            Print text", type: "output" },
        { text: "  date                   Current date/time", type: "output" },
        { text: "  whoami                 Current user", type: "output" },
        { text: "  run                    Run the active editor file", type: "output" },
        { text: "  run-input              Run active file with stdin (type inputs, end with EOF)", type: "output" },
        { text: "  clear / cls            Clear terminal", type: "output" },
        { text: "  history                Show command history", type: "output" },
        { text: "  version                Zuup Code version", type: "output" },
        { text: "", type: "output" },
      );
      return;
    }

    if (cmd === "pwd") {
      pushLines({ text: currentCwd, type: "output" }, { text: "", type: "output" });
      return;
    }

    if (cmd === "date") {
      pushLines({ text: new Date().toString(), type: "output" }, { text: "", type: "output" });
      return;
    }

    if (cmd === "whoami") {
      pushLines({ text: "zuup-student", type: "output" }, { text: "", type: "output" });
      return;
    }

    if (cmd === "version") {
      pushLines({ text: "Zuup Code v2.0.0", type: "output" }, { text: "", type: "output" });
      return;
    }

    if (cmd === "history") {
      const hist = history;
      if (hist.length === 0) {
        pushLines({ text: "(no history)", type: "info" });
      } else {
        hist.forEach((h, i) => {
          pushLines({ text: `  ${String(i + 1).padStart(3, " ")}  ${h}`, type: "output" });
        });
      }
      pushLines({ text: "", type: "output" });
      return;
    }

    if (cmd === "run") {
      // Auto-detect if code needs user input before running
      const needsStdin = detectNeedsStdin(fileContent, fileLang);
      if (needsStdin) {
        pushLines(
          { text: "📥 This program uses interactive input.", type: "info" },
          { text: "   Type each input value below (one per line), then type 'EOF' to run.", type: "info" },
          { text: "   (Press Ctrl+C to cancel)", type: "info" },
          { text: "", type: "output" },
        );
        setStdinMode(true);
        setStdinBuffer([]);
        setStdinPromptText("input>");
        setPendingCode({ code: "__stdin-run__", lang: "__stdin-run__" });
      } else {
        onCommand("run");
        pushLines({ text: "▶ Running active file…", type: "info" }, { text: "", type: "output" });
      }
      return;
    }

    // run-input — collect stdin lines then run
    if (cmd === "run-input") {
      pushLines(
        { text: "📥 Stdin collection mode — type each input line, then type 'EOF' to run.", type: "info" },
        { text: "   (Press Ctrl+C to cancel)", type: "info" },
      );
      setStdinMode(true);
      setStdinBuffer([]);
      setStdinPromptText("input>");
      setPendingCode({ code: "__stdin-run__", lang: "__stdin-run__" });
      return;
    }

    // ── echo ─────────────────────────────────────────────────────────────────
    if (cmd === "echo") {
      const rest = trimmed.slice(5);
      const redirIdx = rest.lastIndexOf(">");
      if (redirIdx !== -1) {
        const text = rest.slice(0, redirIdx).trim().replace(/^["']|["']$/g, "");
        const fileName = rest.slice(redirIdx + 1).trim();
        const fullPath = resolvePath(fileName, currentCwd);
        setFs((prev) => ({
          ...prev,
          [fullPath]: { name: basename(fullPath), content: text + "\n", type: "file" },
        }));
        pushLines(
          { text: `✓ Written to ${fileName}`, type: "success" },
          { text: "", type: "output" },
        );
      } else {
        const text = rest.trim().replace(/^["']|["']$/g, "");
        pushLines({ text, type: "output" }, { text: "", type: "output" });
      }
      return;
    }

    // ── ls ───────────────────────────────────────────────────────────────────
    if (cmd === "ls" || cmd === "dir") {
      const targetPath = args[1] ? resolvePath(args[1], currentCwd) : currentCwd;
      if (!currentFs[targetPath] || currentFs[targetPath].type !== "dir") {
        pushLines(
          { text: `ls: ${args[1] || targetPath}: No such directory`, type: "error" },
          { text: "", type: "output" },
        );
        return;
      }
      const entries = listDir(targetPath, currentFs);
      if (entries.length === 0) {
        pushLines({ text: "(empty)", type: "info" }, { text: "", type: "output" });
      } else {
        const row = entries
          .map((e) => (e.type === "dir" ? `\u001b[34m${e.name}/\u001b[0m` : e.name))
          .join("   ");
        // Since we can't do real ansi in react, let's just prefix dirs
        const parts = entries.map((e) =>
          e.type === "dir"
            ? { text: e.name + "/", type: "info" as LineType }
            : { text: e.name, type: "output" as LineType }
        );
        // Display columns
        const cols = 4;
        for (let i = 0; i < parts.length; i += cols) {
          const chunk = parts.slice(i, i + cols).map((p) => p.text.padEnd(22, " ")).join("");
          pushLines({ text: chunk, type: parts[i].type });
        }
        pushLines({ text: "", type: "output" });
      }
      return;
    }

    // ── cd ───────────────────────────────────────────────────────────────────
    if (cmd === "cd") {
      const target = args[1] || "/home/user";
      const resolved = target === "~" ? "/home/user" : resolvePath(target, currentCwd);
      if (currentFs[resolved] && currentFs[resolved].type === "dir") {
        setCwd(resolved);
        cwdRef.current = resolved;
        pushLines({ text: "", type: "output" });
      } else {
        pushLines(
          { text: `cd: ${target}: No such directory`, type: "error" },
          { text: "", type: "output" },
        );
      }
      return;
    }

    // ── mkdir ────────────────────────────────────────────────────────────────
    if (cmd === "mkdir") {
      if (!args[1]) {
        pushLines({ text: "mkdir: missing operand", type: "error" }, { text: "", type: "output" });
        return;
      }
      const fullPath = resolvePath(args[1], currentCwd);
      setFs((prev) => ({
        ...prev,
        [fullPath]: { name: basename(fullPath), content: "", type: "dir" },
      }));
      pushLines({ text: `Created directory '${args[1]}'`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // ── touch ────────────────────────────────────────────────────────────────
    if (cmd === "touch") {
      if (!args[1]) {
        pushLines({ text: "touch: missing file operand", type: "error" }, { text: "", type: "output" });
        return;
      }
      const fullPath = resolvePath(args[1], currentCwd);
      if (!currentFs[fullPath]) {
        setFs((prev) => ({
          ...prev,
          [fullPath]: { name: basename(fullPath), content: "", type: "file" },
        }));
      }
      pushLines({ text: `✓ Created ${args[1]}`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // ── cat ──────────────────────────────────────────────────────────────────
    if (cmd === "cat") {
      if (!args[1]) {
        pushLines({ text: "cat: missing file operand", type: "error" }, { text: "", type: "output" });
        return;
      }
      const fullPath = resolvePath(args[1], currentCwd);
      const file = currentFs[fullPath];
      if (!file || file.type !== "file") {
        pushLines({ text: `cat: ${args[1]}: No such file`, type: "error" }, { text: "", type: "output" });
        return;
      }
      const fileLines = file.content.split("\n");
      fileLines.forEach((l) => pushLines({ text: l, type: "output" }));
      pushLines({ text: "", type: "output" });
      return;
    }

    // ── rm ───────────────────────────────────────────────────────────────────
    if (cmd === "rm") {
      if (!args[1]) {
        pushLines({ text: "rm: missing operand", type: "error" }, { text: "", type: "output" });
        return;
      }
      const fullPath = resolvePath(args[1], currentCwd);
      if (!currentFs[fullPath]) {
        pushLines({ text: `rm: ${args[1]}: No such file or directory`, type: "error" }, { text: "", type: "output" });
        return;
      }
      setFs((prev) => {
        const next = { ...prev };
        delete next[fullPath];
        return next;
      });
      pushLines({ text: `Removed '${args[1]}'`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // ── cp ───────────────────────────────────────────────────────────────────
    if (cmd === "cp") {
      if (!args[1] || !args[2]) {
        pushLines({ text: "Usage: cp <source> <destination>", type: "error" }, { text: "", type: "output" });
        return;
      }
      const srcPath = resolvePath(args[1], currentCwd);
      const dstPath = resolvePath(args[2], currentCwd);
      const srcFile = currentFs[srcPath];
      if (!srcFile || srcFile.type !== "file") {
        pushLines({ text: `cp: ${args[1]}: No such file`, type: "error" }, { text: "", type: "output" });
        return;
      }
      setFs((prev) => ({
        ...prev,
        [dstPath]: { name: basename(dstPath), content: srcFile.content, type: "file" },
      }));
      pushLines({ text: `Copied '${args[1]}' → '${args[2]}'`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // ── mv ───────────────────────────────────────────────────────────────────
    if (cmd === "mv") {
      if (!args[1] || !args[2]) {
        pushLines({ text: "Usage: mv <source> <destination>", type: "error" }, { text: "", type: "output" });
        return;
      }
      const srcPath = resolvePath(args[1], currentCwd);
      const dstPath = resolvePath(args[2], currentCwd);
      const srcFile = currentFs[srcPath];
      if (!srcFile) {
        pushLines({ text: `mv: ${args[1]}: No such file or directory`, type: "error" }, { text: "", type: "output" });
        return;
      }
      setFs((prev) => {
        const next = { ...prev };
        delete next[srcPath];
        next[dstPath] = { name: basename(dstPath), content: srcFile.content, type: srcFile.type };
        return next;
      });
      pushLines({ text: `Moved '${args[1]}' → '${args[2]}'`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // ── write (multi-line into file) ─────────────────────────────────────────
    if (cmd === "write") {
      if (!args[1]) {
        pushLines({ text: "Usage: write <filename>", type: "error" }, { text: "", type: "output" });
        return;
      }
      const fileName = args[1];
      pushLines(
        { text: `Writing to '${fileName}'. Type content, then type 'EOF' on a new line to save.`, type: "info" },
      );
      // Enter stdin mode to collect lines until "EOF"
      setStdinMode(true);
      setStdinBuffer([]);
      setStdinPromptText(`${fileName}>`);
      setPendingCode({ code: fileName, lang: "__write__" });
      return;
    }

    // ── download ─────────────────────────────────────────────────────────────
    if (cmd === "download") {
      if (!args[1]) {
        pushLines({ text: "Usage: download <filename>", type: "error" }, { text: "", type: "output" });
        return;
      }
      const fullPath = resolvePath(args[1], currentCwd);
      const file = currentFs[fullPath];
      if (!file || file.type !== "file") {
        pushLines({ text: `download: ${args[1]}: No such file`, type: "error" }, { text: "", type: "output" });
        return;
      }
      downloadVFile(file.name, file.content);
      pushLines(
        { text: `⬇ Downloading '${args[1]}' to your computer…`, type: "success" },
        { text: "", type: "output" },
      );
      return;
    }

    // ── csv <filename> — create a sample CSV ──────────────────────────────────
    if (cmd === "csv") {
      const fileName = args[1] || "data.csv";
      const fullPath = resolvePath(fileName, currentCwd);
      const sample =
        "name,age,email,city\n" +
        "Alice,28,alice@example.com,New York\n" +
        "Bob,34,bob@example.com,London\n" +
        "Carol,22,carol@example.com,Tokyo\n" +
        "Dave,45,dave@example.com,Sydney\n";
      setFs((prev) => ({
        ...prev,
        [fullPath]: { name: basename(fullPath), content: sample, type: "file" },
      }));
      pushLines(
        { text: `✓ Created '${fileName}' with sample CSV data (5 rows, 4 columns)`, type: "success" },
        { text: `  Tip: type 'cat ${fileName}' to view, 'download ${fileName}' to save`, type: "info" },
        { text: "", type: "output" },
      );
      return;
    }

    // ── pip install ───────────────────────────────────────────────────────────
    if (cmd === "pip" && args[1] === "install") {
      const pkgs = args.slice(2);
      if (pkgs.length === 0) {
        pushLines({ text: "ERROR: pip install requires at least one package", type: "error" }, { text: "", type: "output" });
        return;
      }
      await simulateInstall("pip", pkgs);
      return;
    }

    // ── npm / yarn / bun install ─────────────────────────────────────────────
    if ((cmd === "npm" && (args[1] === "install" || args[1] === "i")) ||
        (cmd === "yarn" && args[1] === "add") ||
        (cmd === "bun" && args[1] === "add")) {
      const pkgs = args.slice(2);
      if (pkgs.length === 0) {
        pushLines({ text: `${cmd}: no package specified`, type: "error" }, { text: "", type: "output" });
        return;
      }
      await simulateInstall(cmd, pkgs);
      return;
    }

    // ── Unrecognised command ──────────────────────────────────────────────────
    pushLines(
      { text: `zsh: command not found: ${cmd}`, type: "error" },
      { text: `Type 'help' to see available commands.`, type: "info" },
      { text: "", type: "output" },
    );
  }

  // ─── Shell argument splitter (handles quoted strings) ────────────────────────
  function shellSplit(input: string): string[] {
    const args: string[] = [];
    let current = "";
    let inQuote: string | null = null;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        else current += ch;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === " " || ch === "\t") {
        if (current) { args.push(current); current = ""; }
      } else {
        current += ch;
      }
    }
    if (current) args.push(current);
    return args;
  }

  // ─── Key handler ────────────────────────────────────────────────────────────
  const handleKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = input.trim();
      setInput("");

      // ── Stdin collection mode ──────────────────────────────────────────────
      if (stdinMode && pendingCode) {
        if (val === "EOF" || val === "exit") {
          // Finish write mode
          if (pendingCode.lang === "__write__") {
            const fileName = pendingCode.code;
            const fullPath = resolvePath(fileName, cwdRef.current);
            const content = stdinBuffer.join("\n") + "\n";
            setFs((prev) => ({
              ...prev,
              [fullPath]: { name: basename(fullPath), content, type: "file" },
            }));
            pushLines(
              { text: `✓ Saved ${fileName} (${stdinBuffer.length} lines)`, type: "success" },
              { text: `  Tip: 'cat ${fileName}' to view, 'download ${fileName}' to save`, type: "info" },
              { text: "", type: "output" },
            );
          } else if (pendingCode.lang === "__stdin-run__") {
            // stdin for running the active editor file
            const stdin = stdinBuffer.join("\n");
            pushLines({ text: "▶ Running with provided input…", type: "info" });
            // Signal parent: run-with-stdin:<b64stdin>
            onCommand("run-with-stdin:" + btoa(unescape(encodeURIComponent(stdin))));
          }
          setStdinMode(false);
          setStdinBuffer([]);
          setPendingCode(null);
        } else {
          pushLines({ text: `${stdinPromptText} ${val}`, type: "stdin-prompt" });
          setStdinBuffer((prev) => [...prev, val]);
        }
        return;
      }

      // ── Normal command ─────────────────────────────────────────────────────
      if (val) await processCommand(val);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIdx =
          historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIdx);
        setInput(history[newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIdx = historyIndex + 1;
        if (newIdx >= history.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIdx);
          setInput(history[newIdx]);
        }
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Basic tab completion for filenames
      const parts = input.split(" ");
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        const currentFs = fsRef.current;
        const currentCwd = cwdRef.current;
        const matches = Object.keys(currentFs)
          .filter((k) => {
            const parent = k.split("/").slice(0, -1).join("/") || "/";
            return parent === currentCwd && basename(k).startsWith(lastPart);
          })
          .map((k) => basename(k));
        if (matches.length === 1) {
          parts[parts.length - 1] = matches[0] + (currentFs[resolvePath(matches[0], currentCwd)]?.type === "dir" ? "/" : "");
          setInput(parts.join(" "));
        } else if (matches.length > 1) {
          pushLines({ text: matches.join("  "), type: "info" });
        }
      }
    } else if (e.key === "c" && e.ctrlKey) {
      // Ctrl+C — cancel stdin mode
      if (stdinMode) {
        setStdinMode(false);
        setStdinBuffer([]);
        setPendingCode(null);
        pushLines({ text: "^C", type: "error" }, { text: "", type: "output" });
      }
    }
  };

  // ─── Line color mapping ──────────────────────────────────────────────────────
  function lineClass(type: LineType): string {
    switch (type) {
      case "error": return "text-destructive";
      case "success": return "text-emerald-400";
      case "info": return "text-sky-400";
      case "prompt": return "text-violet-400 font-medium";
      case "stdin-prompt": return "text-amber-400";
      default: return "text-foreground/80";
    }
  }

  const promptLabel = stdinMode
    ? stdinPromptText
    : `${cwd} $`;

  return (
    <div className="flex h-full flex-col glass">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <TerminalIcon size={12} className="text-violet-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
            Terminal
          </span>
          {isRunning && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          )}
          {isInstalling && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          )}
        </div>
        <button
          onClick={onClear}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Clear terminal"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Terminal content — always visible */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, i) => (
          <div key={i} className={`leading-relaxed whitespace-pre-wrap ${lineClass(line.type)}`}>
            {line.text || "\u00A0"}
          </div>
        ))}

        {/* Input row */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`font-semibold shrink-0 ${stdinMode ? "text-amber-400" : "text-violet-400"}`}>
            {promptLabel}
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-foreground outline-none caret-primary min-w-0"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            disabled={isInstalling || isRunning}
            placeholder={
              isRunning ? "Running…" :
              isInstalling ? "Installing…" :
              stdinMode ? "Enter input (type EOF to finish)" : ""
            }
          />
        </div>
      </div>
    </div>
  );
};

export default TerminalPanel;
