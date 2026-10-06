import { extractProblems, type Problem } from "@/lib/run/problems";

export interface ProblemCounts {
  errors: number;
  warnings: number;
}

/**
 * Problems found in the latest batch of run output. This is the same rule the terminal's Problems
 * tab uses (it reads the newest batch the editor sends it), so the status bar and the tab agree.
 */
export function problemsFromRunLines(lines: readonly { text: string; type: string }[]): Problem[] {
  return lines.some((l) => l.type === "error") ? extractProblems(lines.map((l) => l.text).join("\n")) : [];
}

export function countProblems(problems: readonly Problem[]): ProblemCounts {
  const errors = problems.filter((p) => p.severity === "error").length;
  return { errors, warnings: problems.length - errors };
}

/** Run problems plus the editor's own markers (type errors and the like). */
export function combineProblemCounts(run: ProblemCounts, editor?: ProblemCounts | null): ProblemCounts {
  return { errors: run.errors + (editor?.errors ?? 0), warnings: run.warnings + (editor?.warnings ?? 0) };
}
