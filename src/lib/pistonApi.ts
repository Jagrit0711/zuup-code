// Zuup Code code runner.
// The browser posts to /api/execute (proxied to Piston) so there are no CORS issues.
// The request body sent to /api/execute is unchanged: { language, version, files, stdin? }.

// Language -> Piston runtime mapping (from emkc.org/api/v2/piston/runtimes)
const LANG_CONFIG: Record<string, { language: string; version: string }> = {
  python:     { language: "python",      version: "3.10.0" },
  javascript: { language: "javascript",  version: "18.15.0" },
  typescript: { language: "typescript",  version: "5.0.3" },
  java:       { language: "java",        version: "15.0.2" },
  c:          { language: "c",           version: "10.2.0" },
  "c++":      { language: "c++",         version: "10.2.0" },
  cpp:        { language: "c++",         version: "10.2.0" },
  go:         { language: "go",          version: "1.16.2" },
  rust:       { language: "rust",        version: "1.68.2" },
  php:        { language: "php",         version: "8.2.3" },
  ruby:       { language: "ruby",        version: "3.0.1" },
  swift:      { language: "swift",       version: "5.3.3" },
  csharp:     { language: "csharp",      version: "6.12.0" },
  kotlin:     { language: "kotlin",      version: "1.8.20" },
  bash:       { language: "bash",        version: "5.2.0" },
  lua:        { language: "lua",         version: "5.4.4" },
  perl:       { language: "perl",        version: "5.36.0" },
  r:          { language: "rscript",     version: "4.1.1" },
  scala:      { language: "scala",       version: "3.2.2" },
  haskell:    { language: "haskell",     version: "9.0.1" },
  clojure:    { language: "clojure",     version: "1.10.3" },
  dart:       { language: "dart",        version: "2.19.6" },
  elixir:     { language: "elixir",      version: "1.11.3" },
  nim:        { language: "nim",         version: "1.6.2" },
};

/** Why a run ended. Each one gets its own plain-language explanation. */
export type RunOutcome =
  | "success"
  | "compile-error"
  | "runtime-error"
  | "timeout"
  | "cancelled"
  | "network-error"
  | "service-error"
  | "unsupported";

export interface ExecutionResult {
  /**
   * Everything worth showing, in order. Program output for finished runs; a plain explanation
   * for runs that never produced output. Kept for callers written against the old shape.
   */
  output: string[];
  success: boolean;
  outcome: RunOutcome;
  /** Program exit code, or null when the program never ran or was killed by a signal. */
  exitCode: number | null;
  /** Signal that stopped the program (e.g. "SIGKILL"), if any. */
  signal: string | null;
  /** Run time in milliseconds: the runner's wall time when reported, else the round trip. */
  durationMs: number;
  stdout: string;
  stderr: string;
  /** Compiler output when compilation failed. */
  compileOutput: string;
  /** One-sentence explanation for every outcome other than success. */
  message: string;
  /** HTTP status from /api/execute, when a response arrived. */
  status?: number;
}

export interface ExecuteOptions {
  /** Abort to cancel the run (e.g. a Stop button). */
  signal?: AbortSignal;
  /** Give up after this long. Default 30 s. */
  timeoutMs?: number;
  /** Extra attempts on 429 / 5xx responses. Default 1. */
  retries?: number;
  /** Base delay before a retry, doubled each attempt. Default 800 ms. */
  retryDelayMs?: number;
  /** The user's file name. Runner paths like "/box/submission/file0.code" are shown as this name. */
  fileName?: string;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 5_000;

export const RUN_MESSAGES = {
  network: "Could not reach the code runner. Check your connection and run again.",
  cancelled: "Run stopped.",
  compile: "Could not compile. Fix the errors above and run again.",
  killed:
    "The runner stopped the program. It may have run too long, waited for input that never came, or used too much memory.",
} as const;

export function isRunnableLanguage(language: string): boolean {
  return language.toLowerCase() in LANG_CONFIG;
}

function secondsLabel(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Resolves after `ms`, or rejects early if `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function retryDelay(response: Response | undefined, attempt: number, base: number): number {
  const header = response?.headers?.get?.("Retry-After");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  return base * 2 ** attempt;
}

interface PistonStage {
  stdout?: string;
  stderr?: string;
  output?: string;
  code?: number | null;
  signal?: string | null;
  status?: string | null;
  message?: string | null;
  wall_time?: number;
}

interface PistonResponse {
  compile?: PistonStage;
  run?: PistonStage;
  message?: string;
}

function trimEnd(s: string | undefined): string {
  return (s ?? "").replace(/\s+$/, "");
}

// Lines the runner adds after a failed build; they only confuse.
const RUNNER_NOISE = /^chmod: cannot access '[^']*': No such file or directory$/;

/** Removes runner internals from output: its noise lines and its temporary file paths. */
export function cleanRunnerText(text: string, fileName?: string): string {
  const base = fileName ? fileName.split("/").pop() || fileName : "";
  let out = text
    .split("\n")
    .filter((line) => !RUNNER_NOISE.test(line.trim()))
    .join("\n");
  if (base) {
    // "/box/submission/file0.code", "/piston/jobs/<id>/file0.code", "file0.code.c" -> "main.c"
    out = out.replace(/(?:\/[\w.-]+)*\/?file0\.code(?:\.[A-Za-z0-9]+)?/g, base);
  }
  return trimEnd(out);
}

function failure(
  outcome: RunOutcome,
  message: string,
  durationMs: number,
  extra: Partial<ExecutionResult> = {}
): ExecutionResult {
  return {
    output: [message],
    success: false,
    outcome,
    exitCode: null,
    signal: null,
    durationMs,
    stdout: "",
    stderr: "",
    compileOutput: "",
    message,
    ...extra,
  };
}

/** Turns a Piston response body into a result. Exported for tests. */
export function interpretPistonResponse(
  body: PistonResponse,
  roundTripMs: number,
  fileName?: string
): ExecutionResult {
  const clean = (s: string | undefined) => cleanRunnerText(s ?? "", fileName);
  const run: PistonStage = { ...(body.run ?? {}), stdout: body.run?.stdout, stderr: clean(body.run?.stderr) };
  const compile: PistonStage | undefined = body.compile && {
    ...body.compile,
    stderr: clean(body.compile.stderr),
    output: clean(body.compile.output),
  };
  const durationMs =
    typeof run.wall_time === "number" && run.wall_time >= 0 ? run.wall_time : roundTripMs;

  const compileFailed =
    !!compile && ((typeof compile.code === "number" && compile.code !== 0) || !!compile.signal);
  if (compileFailed || (!!compile?.stderr && !body.run)) {
    const compileOutput = trimEnd(compile?.stderr || compile?.output || compile?.stdout);
    return {
      output: compileOutput ? [compileOutput] : [RUN_MESSAGES.compile],
      success: false,
      outcome: "compile-error",
      exitCode: typeof compile?.code === "number" ? compile.code : null,
      signal: compile?.signal ?? null,
      durationMs,
      stdout: "",
      stderr: "",
      compileOutput,
      message: RUN_MESSAGES.compile,
    };
  }

  // Compiler warnings on a successful build are still worth showing, ahead of the program's output.
  const warnings = trimEnd(compile?.stderr);
  const stdout = trimEnd(run.stdout);
  const stderr = trimEnd([warnings, run.stderr].filter((s) => s && s.trim()).join("\n"));
  const exitCode = typeof run.code === "number" ? run.code : null;
  const signal = run.signal ?? null;
  const output = [stdout, stderr].filter(Boolean);

  if (signal) {
    return {
      output: output.length ? output : [RUN_MESSAGES.killed],
      success: false,
      outcome: "runtime-error",
      exitCode,
      signal,
      durationMs,
      stdout,
      stderr,
      compileOutput: "",
      message: RUN_MESSAGES.killed,
    };
  }

  // stderr alone is not failure (warnings, logging); a non-zero exit code is.
  const failed = exitCode !== null && exitCode !== 0;
  return {
    output,
    success: !failed,
    outcome: failed ? "runtime-error" : "success",
    exitCode,
    signal: null,
    durationMs,
    stdout,
    stderr,
    compileOutput: "",
    message: failed ? `The program exited with code ${exitCode}.` : "",
  };
}

// ── Main entry ─────────────────────────────────────────
export async function executeCode(
  language: string,
  _version: string,
  code: string,
  stdin?: string,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const lang = language.toLowerCase();
  const config = LANG_CONFIG[lang];
  const started = now();
  const elapsed = () => Math.max(0, Math.round(now() - started));

  if (!config) {
    const message = `${language} can't be run here. It is available for editing only.`;
    return failure("unsupported", message, 0);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? 1);
  const baseDelay = options.retryDelayMs ?? 800;

  // One controller for this run, aborted by the caller's signal or by the timeout.
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const body = JSON.stringify({
    language: config.language,
    version: config.version,
    files: [{ content: code }],
    ...(stdin !== undefined ? { stdin } : {}),
  });

  const aborted = () =>
    timedOut
      ? failure(
          "timeout",
          `Stopped after ${secondsLabel(timeoutMs)} without a result. The code runner may be busy, or the program may be stuck in a loop. Run again in a moment.`,
          elapsed()
        )
      : failure("cancelled", RUN_MESSAGES.cancelled, elapsed());

  try {
    for (let attempt = 0; ; attempt++) {
      if (controller.signal.aborted) return aborted();

      let response: Response;
      try {
        response = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) return aborted();
        if (attempt < retries) {
          await wait(baseDelay * 2 ** attempt, controller.signal);
          continue;
        }
        console.error("Execution request failed:", err);
        return failure("network-error", RUN_MESSAGES.network, elapsed());
      }

      if (!response.ok) {
        if (isTransientStatus(response.status) && attempt < retries) {
          await wait(retryDelay(response, attempt, baseDelay), controller.signal);
          continue;
        }
        let detail = "";
        try {
          detail = (await response.text()).slice(0, 300);
        } catch {
          // Body unreadable; the status is enough.
        }
        if (detail) console.error(`Code runner returned ${response.status}:`, detail);
        const message =
          response.status === 429
            ? "The code runner is handling too many runs right now. Wait a few seconds and run again."
            : response.status >= 500
              ? `The code runner had a problem (status ${response.status}). Run again in a moment.`
              : `The code runner rejected this run (status ${response.status}).`;
        return failure("service-error", message, elapsed(), { status: response.status });
      }

      let parsed: PistonResponse;
      try {
        parsed = (await response.json()) as PistonResponse;
      } catch {
        if (controller.signal.aborted) return aborted();
        return failure(
          "service-error",
          "The code runner sent a reply that could not be read. Run again in a moment.",
          elapsed(),
          { status: response.status }
        );
      }
      return { ...interpretPistonResponse(parsed ?? {}, elapsed(), options.fileName), status: response.status };
    }
  } catch (err) {
    // Only the backoff wait throws here, and only when aborted.
    if (controller.signal.aborted) return aborted();
    console.error("Execution error:", err);
    return failure("network-error", RUN_MESSAGES.network, elapsed());
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onCallerAbort);
  }
}
