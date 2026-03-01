import { Terminal, Trash2, X } from "lucide-react";

interface OutputPanelProps {
  output: string[];
  onClear: () => void;
  isRunning: boolean;
}

const OutputPanel = ({ output, onClear, isRunning }: OutputPanelProps) => {
  return (
    <div className="flex h-full flex-col glass border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Output
          </span>
          {isRunning && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 animate-pulse-glow rounded-full bg-success" />
              <span className="text-xs text-success">Running...</span>
            </div>
          )}
        </div>
        <button
          onClick={onClear}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Output content */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {output.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">
              Click ▶ Run to execute your code
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {output.map((line, i) => (
              <div
                key={i}
                className={`animate-slide-in leading-relaxed ${
                  line.startsWith("Error") || line.startsWith("❌")
                    ? "text-destructive"
                    : line.startsWith("⚠")
                    ? "text-warning"
                    : line.startsWith("✅") || line.startsWith(">>>")
                    ? "text-success"
                    : "text-foreground/80"
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OutputPanel;
