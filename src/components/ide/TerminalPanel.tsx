import { Copy, Search, Square, Trash2, X } from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { detectNeedsStdin } from "@/lib/languages";
import { copyToClipboard } from "@/lib/fileSystem";
import { extractProblems, type Problem } from "@/lib/run/problems";
import type { RunLineType } from "@/lib/run/format";
import IconButton from "@/components/ide/panel/IconButton";
import { cn } from "@/lib/utils";
import { useEditorSettings } from "@/lib/editorSettings";

// Virtual filesystem for the practice shell
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

type LineType = RunLineType;

interface TermLine {
  text: string;
  type: LineType;
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface TerminalProps {
  onClear: () => void;
  onCommand: (cmd: string, stdin?: string) => void;
  isRunning: boolean;
  /** Active file info so the terminal can detect stdin needs. */
  fileContent?: string;
  fileLang?: string;
  /** False when no file is open, so "run" can say so instead of pretending to execute something. */
  hasActiveFile?: boolean;
  /** Lines pushed by the parent (run start, run results). Each new array is appended. */
  externalLines?: TermLine[];
  /** Changes when the Run button needs stdin collected in the terminal. */
  requestStdin?: number;
  /** When provided, a Stop button appears while running and Ctrl+C stops the run. */
  onStop?: () => void;
  /** When provided, problems with a line number become links to that line. */
  onRevealProblem?: (problem: Problem) => void;
  /** Switches to `tab` whenever `nonce` changes (e.g. the status bar's Problems item). */
  requestTab?: { tab: PanelTab; nonce: number };
}

export type PanelTab = "terminal" | "output" | "problems";

const LINE_CLASS: Record<LineType, string> = {
  output: "text-foreground/85",
  error: "text-danger",
  success: "text-success",
  warning: "text-warning",
  info: "text-muted-foreground",
  prompt: "text-foreground",
  "stdin-prompt": "text-warning",
};

const WELCOME: TermLine[] = [
  { text: "Type help to see commands, or run to run the open file.", type: "info" },
  { text: "", type: "output" },
];

const TerminalPanel = ({
  onClear,
  onCommand,
  isRunning,
  fileContent = "",
  fileLang = "",
  hasActiveFile = true,
  externalLines,
  requestStdin,
  onStop,
  onRevealProblem,
  requestTab,
}: TerminalProps) => {
  const { settings } = useEditorSettings();
  const bodyStyle = { fontSize: `${settings.terminalFontSize}px` };
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Virtual filesystem state
  const [fs, setFs] = useState<Record<string, VFile>>(buildFS());
  const [cwd, setCwd] = useState("/home/user");

  // Terminal display lines
  const [lines, setLines] = useState<TermLine[]>(WELCOME);
  // Program output only (what the Output tab shows)
  const [runLines, setRunLines] = useState<TermLine[]>([]);
  // Most recent batch from the parent; Problems are read from it
  const [lastBatch, setLastBatch] = useState<TermLine[]>([]);

  // Stdin collection mode: when a program needs input
  const [stdinMode, setStdinMode] = useState(false);
  const [stdinBuffer, setStdinBuffer] = useState<string[]>([]);
  const [stdinPromptText, setStdinPromptText] = useState(">");
  const [pendingCode, setPendingCode] = useState<{ code: string; lang: string } | null>(null);

  // Package install simulation
  const [isInstalling, setIsInstalling] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const fsRef = useRef(fs);
  const cwdRef = useRef(cwd);
  useEffect(() => { fsRef.current = fs; }, [fs]);
  useEffect(() => { cwdRef.current = cwd; }, [cwd]);

  // Keep the newest line in view
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [lines, panelTab]);
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [runLines, panelTab]);

  // Refocus the prompt after a run or install finishes
  useEffect(() => {
    if (!isRunning && !isInstalling && inputRef.current && panelTab === "terminal") {
      const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      return () => clearTimeout(t);
    }
  }, [isRunning, isInstalling, panelTab]);

  // Receive lines from the parent (run start and results)
  useEffect(() => {
    if (externalLines && externalLines.length > 0) {
      setLines((prev) => [...prev, ...externalLines, { text: "", type: "output" }]);
      setRunLines((prev) => [...prev, ...externalLines, { text: "", type: "output" }]);
      setLastBatch(externalLines);
    }
  }, [externalLines]);

  // Parent asked for a specific tab
  const requestNonce = requestTab?.nonce;
  const requestedTab = requestTab?.tab;
  useEffect(() => {
    if (requestNonce !== undefined && requestedTab) setPanelTab(requestedTab);
  }, [requestNonce, requestedTab]);

  // Run button asked for stdin
  useEffect(() => {
    if (requestStdin) {
      setPanelTab("terminal");
      setStdinMode(true);
      setStdinBuffer([]);
      setStdinPromptText("input >");
      setPendingCode({ code: "__stdin-run__", lang: "__stdin-run__" });
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [requestStdin]);

  const pushLines = useCallback((...newLines: TermLine[]) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  // Path helpers
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

  // Download a virtual file
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

  // Simulated package install
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
        { text: "Done", type: "success" },
        { text: "", type: "output" },
      );
    }
    setIsInstalling(false);
  }

  // Core command processor
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

    // built-ins
    if (cmd === "clear" || cmd === "cls") {
      setLines([]);
      return;
    }

    if (cmd === "help") {
      pushLines(
        { text: "Files", type: "info" },
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
        { text: "Packages (simulated, nothing is installed)", type: "info" },
        { text: "  pip install <pkg>      Install Python package (simulated)", type: "output" },
        { text: "  npm install <pkg>      Install Node package (simulated)", type: "output" },
        { text: "  yarn add <pkg>         Install with Yarn (simulated)", type: "output" },
        { text: "  bun add <pkg>          Install with Bun (simulated)", type: "output" },
        { text: "", type: "output" },
        { text: "Other", type: "info" },
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
      pushLines({ text: "Zuup Code in the browser. Programs run on a remote code runner.", type: "output" }, { text: "", type: "output" });
      return;
    }

    if (cmd === "history") {
      const hist = history;
      if (hist.length === 0) {
        pushLines({ text: "No commands yet", type: "info" });
      } else {
        hist.forEach((h, i) => {
          pushLines({ text: `  ${String(i + 1).padStart(3, " ")}  ${h}`, type: "output" });
        });
      }
      pushLines({ text: "", type: "output" });
      return;
    }

    if (cmd === "run") {
      if (!hasActiveFile) {
        pushLines({ text: "No file is open. Create or open a file first, then run it.", type: "error" });
        return;
      }
      const rest = trimmed.slice(3).trim();
      if (rest) {
        // User typed "run <input>", e.g. "run 42" or "run 10 20"
        pushLines(
          { text: `Running the open file with input: ${rest}`, type: "info" }
        );
        onCommand("run-with-stdin:" + btoa(unescape(encodeURIComponent(rest + "\n"))));
        return;
      }

      // Check if active file requires input
      const needsStdin = detectNeedsStdin(fileContent, fileLang);
      if (needsStdin) {
        pushLines(
          { text: "This program reads input.", type: "info" },
          { text: "Type the input and press Enter. Shift+Enter adds another line.", type: "stdin-prompt" },
        );
        setStdinMode(true);
        setStdinBuffer([]);
        setStdinPromptText("input >");
        setPendingCode({ code: "__stdin-run__", lang: "__stdin-run__" });
        return;
      }

      onCommand("run");
      pushLines({ text: "Running the open file", type: "info" });
      return;
    }

    // run-input — enter direct stdin collection in terminal
    if (cmd === "run-input") {
      if (!hasActiveFile) {
        pushLines({ text: "No file is open. Create or open a file first, then run it.", type: "error" });
        return;
      }
      pushLines(
        { text: "Type the program input and press Enter. Shift+Enter adds another line, Ctrl+C cancels.", type: "info" },
      );
      setStdinMode(true);
      setStdinBuffer([]);
      setStdinPromptText("input >");
      setPendingCode({ code: "__stdin-run__", lang: "__stdin-run__" });
      return;
    }

    // echo
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
          { text: `Wrote ${fileName}`, type: "success" },
          { text: "", type: "output" },
        );
      } else {
        const text = rest.trim().replace(/^["']|["']$/g, "");
        pushLines({ text, type: "output" }, { text: "", type: "output" });
      }
      return;
    }

    // ls
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
        pushLines({ text: "Empty", type: "info" }, { text: "", type: "output" });
      } else {
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

    // cd
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

    // mkdir
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

    // touch
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
      pushLines({ text: `Created ${args[1]}`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // cat
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

    // rm
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

    // cp
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
      pushLines({ text: `Copied ${args[1]} to ${args[2]}`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // mv
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
      pushLines({ text: `Moved ${args[1]} to ${args[2]}`, type: "success" }, { text: "", type: "output" });
      return;
    }

    // write (multi-line into file)
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

    // download
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
        { text: `Downloading ${args[1]}`, type: "success" },
        { text: "", type: "output" },
      );
      return;
    }

    // csv <filename> — create a sample CSV
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
        { text: `Created ${fileName} with sample data (5 rows, 4 columns)`, type: "success" },
        { text: `cat ${fileName} to view it, download ${fileName} to save it`, type: "info" },
        { text: "", type: "output" },
      );
      return;
    }

    // pip install
    if (cmd === "pip" && args[1] === "install") {
      const pkgs = args.slice(2);
      if (pkgs.length === 0) {
        pushLines({ text: "ERROR: pip install requires at least one package", type: "error" }, { text: "", type: "output" });
        return;
      }
      await simulateInstall("pip", pkgs);
      return;
    }

    // npm / yarn / bun install
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

    // Unrecognised command
    pushLines(
      { text: `zsh: command not found: ${cmd}`, type: "error" },
      { text: `Type 'help' to see available commands.`, type: "info" },
      { text: "", type: "output" },
    );
  }

  // Shell argument splitter (handles quoted strings)
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

  // Key handler
  const handleKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    // Multi-line stdin support: Shift+Enter queues line in buffer
    if (e.key === "Enter" && e.shiftKey && stdinMode) {
      e.preventDefault();
      const val = input;
      setInput("");
      pushLines({ text: `${stdinPromptText} ${val}`, type: "stdin-prompt" });
      setStdinBuffer((prev) => [...prev, val]);
      setStdinPromptText(`input ${stdinBuffer.length + 2} >`);
      return;
    }

    if (e.key === "Enter") {
      const val = input;
      setInput("");

      // Stdin collection mode
      if (stdinMode && pendingCode) {
        if (pendingCode.lang === "__write__") {
          const trimmedVal = val.trim();
          if (trimmedVal === "EOF" || trimmedVal === "exit") {
            const fileName = pendingCode.code;
            const fullPath = resolvePath(fileName, cwdRef.current);
            const content = stdinBuffer.join("\n") + "\n";
            setFs((prev) => ({
              ...prev,
              [fullPath]: { name: basename(fullPath), content, type: "file" },
            }));
            pushLines(
              { text: `Saved ${fileName} (${stdinBuffer.length} lines)`, type: "success" },
              { text: `cat ${fileName} to view it, download ${fileName} to save it`, type: "info" },
              { text: "", type: "output" },
            );
            setStdinMode(false);
            setStdinBuffer([]);
            setPendingCode(null);
          } else {
            pushLines({ text: `> ${val}`, type: "stdin-prompt" });
            setStdinBuffer((prev) => [...prev, val]);
          }
          return;
        }

        if (pendingCode.lang === "__stdin-run__") {
          const trimmedVal = val.trim();
          // Echo input line directly in terminal
          pushLines({ text: `${stdinPromptText} ${val || "(empty input)"}`, type: "stdin-prompt" });

          const allLines = stdinBuffer.length > 0 ? [...stdinBuffer, val] : [val];
          const finalStdin = allLines.join("\n");

          const stdinToSend =
            trimmedVal === "none" || trimmedVal === "skip"
              ? ""
              : finalStdin + "\n";

          pushLines({ text: "Running with this input", type: "info" });
          onCommand("run-with-stdin:" + btoa(unescape(encodeURIComponent(stdinToSend))));

          setStdinMode(false);
          setStdinBuffer([]);
          setPendingCode(null);
          return;
        }
      }

      // Normal command
      if (val.trim()) await processCommand(val.trim());
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
        pushLines({ text: "^C  input cancelled", type: "error" }, { text: "", type: "output" });
      }
    }
  };
  const matchesFilter = useCallback(
    (l: TermLine) => !filterQuery.trim() || l.text.toLowerCase().includes(filterQuery.trim().toLowerCase()),
    [filterQuery]
  );
  const filteredLines = useMemo(() => lines.filter(matchesFilter), [lines, matchesFilter]);
  const filteredRunLines = useMemo(() => runLines.filter(matchesFilter), [runLines, matchesFilter]);

  const problems = useMemo(
    // Tracebacks mix error-coloured and plain lines, so read the whole batch once a run has failed.
    () =>
      lastBatch.some((l) => l.type === "error")
        ? extractProblems(lastBatch.map((l) => l.text).join("\n"))
        : [],
    [lastBatch]
  );
  const errorCount = problems.filter((p) => p.severity === "error").length;

  const visibleText = (panelTab === "output" ? filteredRunLines : filteredLines).map((l) => l.text).join("\n").trim();

  const handleCopy = async () => {
    const text =
      panelTab === "problems"
        ? problems.map((p) => `${p.line ? `${p.file ?? ""}:${p.line}${p.column ? `:${p.column}` : ""} ` : ""}${p.message}`).join("\n")
        : visibleText;
    if (!text) return;
    try {
      await copyToClipboard(text);
      toast.success(panelTab === "problems" ? "Problems copied" : "Output copied");
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  };

  const handleClear = () => {
    setLines([]);
    setRunLines([]);
    setLastBatch([]);
    onClear();
  };

  const tabs: { id: PanelTab; label: string; count?: number }[] = [
    { id: "terminal", label: "Terminal" },
    { id: "output", label: "Output" },
    { id: "problems", label: "Problems", count: problems.length },
  ];

  const status = isRunning ? "Running" : isInstalling ? "Installing" : stdinMode ? "Waiting for input" : "";

  return (
    <div
      className="flex h-full flex-col border-t border-rule bg-ink"
      onKeyDown={(e) => {
        // Ctrl+C stops a run when nothing is selected (so copying still works).
        if (isRunning && onStop && e.ctrlKey && e.key === "c" && !window.getSelection()?.toString()) {
          e.preventDefault();
          onStop();
        }
      }}
    >
      {/* Tabs and actions */}
      <div className="flex h-8 shrink-0 select-none items-stretch justify-between gap-2 border-b border-rule pl-1 pr-1.5">
        <div role="tablist" aria-label="Bottom panel" className="flex items-stretch">
          {tabs.map((tab) => {
            const active = panelTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setPanelTab(tab.id)}
                className={cn(
                  "relative flex items-center px-2.5 text-[12px] transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={cn(
                      "ml-1.5 tabular-nums",
                      tab.id === "problems" && errorCount > 0 ? "text-danger" : "text-faint"
                    )}
                    aria-label={`${tab.count} ${tab.count === 1 ? "problem" : "problems"}`}
                  >
                    {tab.count}
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-2.5 bottom-0 h-px transition-colors duration-150",
                    active ? "bg-foreground" : "bg-transparent"
                  )}
                />
              </button>
            );
          })}

          {status && (
            <span className="ml-3 flex items-center gap-1.5 text-[12px] text-muted-foreground" role="status">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full motion-safe:animate-pulse",
                  isRunning ? "bg-success" : "bg-warning"
                )}
              />
              {status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {isRunning && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="mr-1 flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Square size={10} className="fill-current" aria-hidden />
              Stop
              <span className="font-mono text-[11px] text-faint">Ctrl+C</span>
            </button>
          )}

          {panelTab !== "problems" &&
            (filterOpen || filterQuery ? (
              <div className="mr-1 flex h-6 items-center gap-1 rounded-md border border-rule bg-ink px-1.5 focus-within:border-primary/60">
                <Search size={12} className="shrink-0 text-faint" aria-hidden />
                <input
                  ref={filterRef}
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setFilterQuery("");
                      setFilterOpen(false);
                    }
                  }}
                  onBlur={() => !filterQuery && setFilterOpen(false)}
                  autoFocus
                  placeholder="Filter lines"
                  aria-label="Filter lines"
                  className="w-24 bg-transparent text-[12px] text-foreground outline-none placeholder:text-faint sm:w-32"
                />
                {filterQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterQuery("");
                      filterRef.current?.focus();
                    }}
                    aria-label="Clear filter"
                    className="rounded text-faint hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ) : (
              <IconButton label="Filter lines" onClick={() => setFilterOpen(true)}>
                <Search size={13} />
              </IconButton>
            ))}

          <IconButton
            label={panelTab === "problems" ? "Copy problems" : "Copy output"}
            onClick={handleCopy}
            disabled={panelTab === "problems" ? problems.length === 0 : !visibleText}
          >
            <Copy size={13} />
          </IconButton>
          <IconButton label="Clear" onClick={handleClear}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      {panelTab === "problems" ? (
        <div id="panel-problems" role="tabpanel" className="flex-1 overflow-y-auto py-1" style={bodyStyle}>
          {problems.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">
              {lastBatch.some((l) => l.type === "error")
                ? "The last run failed, but the error does not point at a line. See Output for the full message."
                : "No problems in the last run."}
            </p>
          ) : (
            <ul>
              {problems.map((p, i) => {
                const location = p.line ? `Ln ${p.line}${p.column ? `, Col ${p.column}` : ""}` : "";
                const clickable = !!onRevealProblem && !!p.line;
                const content = (
                  <>
                    <span className={cn("w-16 shrink-0", p.severity === "error" ? "text-danger" : "text-warning")}>
                      {p.severity === "error" ? "Error" : "Warning"}
                    </span>
                    <span className="w-28 shrink-0 truncate text-[0.92em] text-faint" title={p.file}>
                      {location}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.92em] text-foreground/90" title={p.message}>
                      {p.message}
                    </span>
                  </>
                );
                return (
                  <li key={i}>
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => onRevealProblem?.(p)}
                        className="flex w-full items-baseline gap-3 px-3 py-1 text-left transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex items-baseline gap-3 px-3 py-1">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : panelTab === "output" ? (
        <div
          id="panel-output"
          role="tabpanel"
          ref={outputRef}
          className="flex-1 overflow-y-auto px-3 py-2 font-mono leading-[1.6]"
          style={bodyStyle}
        >
          {filteredRunLines.length === 0 ? (
            <p className="font-sans text-[13px] text-muted-foreground">
              {filterQuery ? "No lines match the filter." : "Run a file to see its output here."}
            </p>
          ) : (
            filteredRunLines.map((line, i) => (
              <div key={i} className={cn("whitespace-pre-wrap break-words", LINE_CLASS[line.type])}>
                {line.text || " "}
              </div>
            ))
          )}
        </div>
      ) : (
        <div
          id="panel-terminal"
          role="tabpanel"
          ref={terminalRef}
          className="flex-1 cursor-text overflow-y-auto px-3 py-2 font-mono leading-[1.6]"
          style={bodyStyle}
          onClick={() => {
            if (!window.getSelection()?.toString()) inputRef.current?.focus();
          }}
        >
          {filteredLines.map((line, i) => (
            <div key={i} className={cn("whitespace-pre-wrap break-words", LINE_CLASS[line.type])}>
              {line.type === "prompt" ? (
                <PromptEcho text={line.text} />
              ) : (
                line.text || " "
              )}
            </div>
          ))}

          {/* Prompt row */}
          <div className="flex items-center gap-2">
            <span className={cn("shrink-0 select-none", stdinMode ? "text-warning" : "text-faint")}>
              {stdinMode ? stdinPromptText : <>{cwd.replace(/^\/home\/user/, "~")} $</>}
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              className="min-w-0 flex-1 bg-transparent text-foreground caret-primary outline-none placeholder:text-faint disabled:opacity-60"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label={stdinMode ? "Program input" : "Terminal command"}
              disabled={isInstalling || isRunning}
              placeholder={
                isRunning ? "" : isInstalling ? "" : stdinMode ? "Type input and press Enter" : ""
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

/** An echoed command: the faint path and "$", then the command itself. */
function PromptEcho({ text }: { text: string }) {
  const idx = text.indexOf(" $ ");
  if (idx === -1) return <>{text}</>;
  const path = text.slice(0, idx).replace(/^\/home\/user/, "~");
  return (
    <>
      <span className="text-faint">{path} $ </span>
      {text.slice(idx + 3)}
    </>
  );
}

export default TerminalPanel;
