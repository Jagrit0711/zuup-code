/** A compiler or runtime error located in the user's code. */
export interface Problem {
  message: string;
  line?: number;
  column?: number;
  file?: string;
  severity: "error" | "warning";
}

// gcc / clang / rustc-style: "main.c:3:5: error: expected ';'" (also javac "Main.java:3: error: ...")
const COLON_LOCATED = /^\s*([^\s:][^:]*?\.[A-Za-z0-9]+):(\d+)(?::(\d+))?:\s*(fatal error|error|warning)?:?\s*(.*)$/;
// Python: '  File "main.py", line 3, in <module>'
const PYTHON_FRAME = /File "([^"]+)", line (\d+)/;
// Python final line: "NameError: name 'x' is not defined"
const PYTHON_ERROR = /^([A-Z][A-Za-z]*(?:Error|Exception|Warning)|KeyboardInterrupt|SystemExit)(?::\s*(.*))?$/;
// rustc: " --> src/main.rs:3:5"
const RUST_ARROW = /^\s*-->\s*([^:]+):(\d+):(\d+)/;
// Node stack frame: "    at Object.<anonymous> (/piston/jobs/x/file0.code:3:9)"
const NODE_FRAME = /\(([^()]+):(\d+):(\d+)\)\s*$/;

function cleanFile(file: string): string {
  return file.split("/").pop() ?? file;
}

/**
 * Pulls located problems out of compiler / interpreter error text. Unlocated error lines
 * become a problem without a line number only when nothing located was found.
 */
export function extractProblems(errorText: string): Problem[] {
  const problems: Problem[] = [];
  const lines = errorText.split("\n");
  let pythonFrame: { file: string; line: number } | null = null;
  let pendingRust: Problem | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line) continue;

    const py = PYTHON_FRAME.exec(line);
    if (py) {
      pythonFrame = { file: cleanFile(py[1]), line: Number(py[2]) };
      continue;
    }

    const pyErr = PYTHON_ERROR.exec(line.trim());
    if (pyErr && pythonFrame) {
      problems.push({
        message: pyErr[2] ? `${pyErr[1]}: ${pyErr[2]}` : pyErr[1],
        line: pythonFrame.line,
        file: pythonFrame.file,
        severity: /Warning$/.test(pyErr[1]) ? "warning" : "error",
      });
      pythonFrame = null;
      continue;
    }

    if (/^(error|warning)(\[\w+\])?:/.test(line)) {
      pendingRust = {
        message: line.replace(/^(error|warning)(\[\w+\])?:\s*/, ""),
        severity: line.startsWith("warning") ? "warning" : "error",
      };
      continue;
    }
    const arrow = RUST_ARROW.exec(line);
    if (arrow && pendingRust) {
      problems.push({ ...pendingRust, file: cleanFile(arrow[1]), line: Number(arrow[2]), column: Number(arrow[3]) });
      pendingRust = null;
      continue;
    }

    const located = COLON_LOCATED.exec(line);
    if (located && (located[4] || located[5])) {
      const kind = located[4] ?? "error";
      const message = (located[5] || kind).trim();
      if (!message) continue;
      problems.push({
        message,
        file: cleanFile(located[1]),
        line: Number(located[2]),
        column: located[3] ? Number(located[3]) : undefined,
        severity: kind === "warning" ? "warning" : "error",
      });
      continue;
    }

    const frame = NODE_FRAME.exec(line);
    if (frame && problems.length > 0 && problems[problems.length - 1].line === undefined) {
      const last = problems[problems.length - 1];
      last.line = Number(frame[2]);
      last.column = Number(frame[3]);
      continue;
    }

    // "TypeError: x is not a function" from Node, "Exception in thread ..." from Java.
    if (/^(\w*Error|Exception in thread|Uncaught)\b/.test(line.trim())) {
      problems.push({ message: line.trim(), severity: "error" });
    }
  }

  // Keep one entry per location and message.
  const seen = new Set<string>();
  return problems.filter((p) => {
    const key = `${p.file ?? ""}:${p.line ?? ""}:${p.column ?? ""}:${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
