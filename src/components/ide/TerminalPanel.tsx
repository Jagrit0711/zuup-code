import { Terminal as TerminalIcon, Trash2, SquareTerminal } from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface TerminalProps {
  output: string[];
  onClear: () => void;
  onCommand: (cmd: string) => void;
  isRunning: boolean;
  activeTab: "output" | "terminal";
  onTabChange: (tab: "output" | "terminal") => void;
}

const TerminalPanel = ({ output, onClear, onCommand, isRunning, activeTab, onTabChange }: TerminalProps) => {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Zuup Code Terminal v1.0",
    "Type 'help' for available commands.",
    "",
  ]);
  const outputRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "output" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
    if (activeTab === "terminal" && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output, terminalLines, activeTab]);

  const handleTerminalKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      const cmd = input.trim();
      setHistory((prev) => [...prev, cmd]);
      setHistoryIndex(-1);
      setTerminalLines((prev) => [...prev, `$ ${cmd}`]);

      // Process built-in commands
      const lower = cmd.toLowerCase();
      if (lower === "help") {
        setTerminalLines((prev) => [
          ...prev,
          "Available commands:",
          "  help     — Show this message",
          "  clear    — Clear terminal",
          "  date     — Show current date",
          "  echo     — Echo text",
          "  whoami   — Current user",
          "  version  — Zuup Code version",
          "",
        ]);
      } else if (lower === "clear") {
        setTerminalLines([]);
      } else if (lower === "date") {
        setTerminalLines((prev) => [...prev, new Date().toString(), ""]);
      } else if (lower.startsWith("echo ")) {
        setTerminalLines((prev) => [...prev, cmd.slice(5), ""]);
      } else if (lower === "whoami") {
        setTerminalLines((prev) => [...prev, "zuup-student", ""]);
      } else if (lower === "version") {
        setTerminalLines((prev) => [...prev, "Zuup Code v1.0.0", ""]);
      } else {
        onCommand(cmd);
        setTerminalLines((prev) => [...prev, `Command '${cmd}' sent to executor.`, ""]);
      }
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
    }
  };

  return (
    <div className="flex h-full flex-col glass">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-0">
          <button
            onClick={() => onTabChange("output")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "output"
                ? "border-b-primary text-foreground"
                : "border-b-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <SquareTerminal size={12} />
            Output
            {isRunning && (
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-success" />
            )}
          </button>
          <button
            onClick={() => onTabChange("terminal")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "terminal"
                ? "border-b-primary text-foreground"
                : "border-b-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <TerminalIcon size={12} />
            Terminal
          </button>
        </div>
        <button
          onClick={onClear}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Clear"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Content */}
      {activeTab === "output" ? (
        <div ref={outputRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs">
          {output.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[11px] text-muted-foreground">
                Click Run to execute your code
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {output.map((line, i) => (
                <div
                  key={i}
                  className={`leading-relaxed ${
                    line.startsWith("Error") || line.startsWith("[ERROR]")
                      ? "text-destructive"
                      : line.startsWith("[WARN]")
                      ? "text-warning"
                      : line.startsWith("[OK]") || line.startsWith(">>>")
                      ? "text-success"
                      : "text-foreground/80"
                  }`}
                >
                  {line || "\u00A0"}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs"
          onClick={() => inputRef.current?.focus()}
        >
          {terminalLines.map((line, i) => (
            <div key={i} className="leading-relaxed text-foreground/80">
              {line || "\u00A0"}
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-primary font-semibold">$</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleTerminalKey}
              className="flex-1 bg-transparent text-foreground outline-none caret-primary"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TerminalPanel;
