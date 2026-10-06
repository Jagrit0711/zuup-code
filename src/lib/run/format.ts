import type { ExecutionResult } from "@/lib/pistonApi";

/** Line kinds understood by TerminalPanel. */
export type RunLineType = "output" | "error" | "success" | "info" | "prompt" | "stdin-prompt" | "warning";

export interface RunLine {
  text: string;
  type: RunLineType;
}

/** "12 ms" below 0.1 s, "0.42 s" below 10 s, "12.3 s" below a minute, then "1 min 4 s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 100) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/** The one closing line for a run: what happened, how long it took. */
export function summarizeRun(result: ExecutionResult): RunLine {
  const took = formatDuration(result.durationMs);
  switch (result.outcome) {
    case "success":
      return { text: `Finished in ${took}`, type: "success" };
    case "runtime-error":
      if (result.signal) {
        return { text: `Stopped by the runner (${result.signal}) after ${took}. ${result.message}`, type: "error" };
      }
      return { text: `Exited with code ${result.exitCode ?? "unknown"} after ${took}`, type: "error" };
    case "compile-error":
      return { text: result.message, type: "error" };
    case "cancelled":
      return { text: `Run stopped after ${took}`, type: "warning" };
    case "timeout":
      return { text: result.message, type: "warning" };
    default:
      return { text: result.message, type: "error" };
  }
}

function splitLines(text: string, type: RunLineType): RunLine[] {
  if (!text) return [];
  return text.split("\n").map((line) => ({ text: line, type }));
}

/**
 * Terminal lines for a finished run: program stdout, then stderr (or compiler output) in the
 * error colour, then the summary line. No emoji, no decoration.
 */
export function runResultToLines(result: ExecutionResult): RunLine[] {
  const body: RunLine[] = [
    ...splitLines(result.compileOutput, "error"),
    ...splitLines(result.stdout, "output"),
    ...splitLines(result.stderr, "error"),
  ];
  const lines = body.length ? [...body, { text: "", type: "output" as const }] : [];
  if (result.outcome === "success" && body.length === 0) {
    lines.push({ text: "The program printed nothing.", type: "info" });
  }
  lines.push(summarizeRun(result));
  return lines;
}

/** The line shown while a run is in flight. */
export function runStartLine(fileName: string, languageLabel: string): RunLine {
  return { text: `Running ${fileName} (${languageLabel})`, type: "info" };
}
