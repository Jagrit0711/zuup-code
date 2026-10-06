import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanRunnerText, executeCode, interpretPistonResponse, RUN_MESSAGES } from "@/lib/pistonApi";
import { formatDuration, runResultToLines, summarizeRun } from "@/lib/run/format";
import { extractProblems } from "@/lib/run/problems";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function abortableFetch() {
  return vi.fn().mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })
  );
}

describe("executeCode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the /api/execute contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ run: { stdout: "hi\n", stderr: "", code: 0 } }));
    vi.stubGlobal("fetch", fetchMock);
    await executeCode("python", "3.10.0", "print('hi')", "1\n");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/execute");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      language: "python",
      version: "3.10.0",
      files: [{ content: "print('hi')" }],
      stdin: "1\n",
    });
  });

  it("reports success with the runner's wall time and exit code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ run: { stdout: "42\n", stderr: "", code: 0, signal: null, wall_time: 420 } }))
    );
    const result = await executeCode("python", "", "print(42)");
    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBe(420);
    expect(result.output).toEqual(["42"]);
    expect(summarizeRun(result)).toEqual({ text: "Finished in 0.42 s", type: "success" });
  });

  it("distinguishes compile errors from runtime errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ compile: { stderr: "main.c:3:5: error: expected ';'\n", code: 1 }, run: { stdout: "", stderr: "", code: null } })
      )
    );
    const compiled = await executeCode("c", "", "int main(){");
    expect(compiled.outcome).toBe("compile-error");
    expect(compiled.compileOutput).toContain("expected ';'");
    expect(compiled.message).toBe(RUN_MESSAGES.compile);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ run: { stdout: "", stderr: "ZeroDivisionError", code: 1, wall_time: 10 } }))
    );
    const crashed = await executeCode("python", "", "1/0");
    expect(crashed.outcome).toBe("runtime-error");
    expect(crashed.exitCode).toBe(1);
    expect(summarizeRun(crashed).text).toBe("Exited with code 1 after 10 ms");
  });

  it("does not treat stderr alone as failure", () => {
    const result = interpretPistonResponse({ run: { stdout: "ok", stderr: "warning: deprecated", code: 0 } }, 5);
    expect(result.success).toBe(true);
    expect(result.stderr).toBe("warning: deprecated");
  });

  it("explains a program killed by a signal", () => {
    const result = interpretPistonResponse({ run: { stdout: "", stderr: "", code: null, signal: "SIGKILL", wall_time: 3000 } }, 3100);
    expect(result.outcome).toBe("runtime-error");
    expect(summarizeRun(result).text).toContain("SIGKILL");
  });

  it("reports network failures in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await executeCode("python", "", "print(1)", undefined, { retryDelayMs: 1 });
    expect(result.outcome).toBe("network-error");
    expect(result.output).toEqual([RUN_MESSAGES.network]);
  });

  it("retries once on a transient 5xx, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "busy" }, 503))
      .mockResolvedValueOnce(jsonResponse({ run: { stdout: "ok", stderr: "", code: 0 } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeCode("python", "", "print('ok')", undefined, { retryDelayMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it("gives up after one retry on repeated 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "slow down" }, 429));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeCode("python", "", "x", undefined, { retryDelayMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe("service-error");
    expect(result.status).toBe(429);
  });

  it("does not retry a 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "bad" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeCode("python", "", "x", undefined, { retryDelayMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("service-error");
  });

  it("times out with a clear message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortableFetch());
    const pending = executeCode("python", "", "while True: pass", undefined, { timeoutMs: 30_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.outcome).toBe("timeout");
    expect(result.message).toContain("30 s");
  });

  it("can be cancelled with an AbortSignal", async () => {
    vi.stubGlobal("fetch", abortableFetch());
    const controller = new AbortController();
    const pending = executeCode("python", "", "x", undefined, { signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(result.outcome).toBe("cancelled");
    expect(result.success).toBe(false);
  });

  it("refuses unsupported languages without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeCode("cobol", "", "x");
    expect(result.outcome).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts emoji in output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const results = [
      await executeCode("cobol", "", "x"),
      await executeCode("python", "", "x", undefined, { retryDelayMs: 1 }),
      interpretPistonResponse({ run: { stdout: "", stderr: "", code: 0 } }, 1),
    ];
    for (const r of results) {
      for (const line of [...r.output, ...runResultToLines(r).map((l) => l.text)]) {
        expect(line).not.toMatch(EMOJI);
      }
    }
  });
});

describe("cleanRunnerText", () => {
  it("drops runner noise and shows the user's file name", () => {
    const raw = "file0.code.c:3:15: error: expected ';'\nchmod: cannot access 'a.out': No such file or directory";
    expect(cleanRunnerText(raw, "src/broken.c")).toBe("broken.c:3:15: error: expected ';'");
    expect(cleanRunnerText('  File "/box/submission/file0.code", line 4', "main.py")).toBe('  File "main.py", line 4');
  });

  it("is applied to compile output", () => {
    const r = interpretPistonResponse(
      { compile: { stderr: "file0.code.c:1:1: error: x\nchmod: cannot access 'a.out': No such file or directory", code: 1 } },
      1,
      "main.c"
    );
    expect(r.compileOutput).toBe("main.c:1:1: error: x");
  });
});

describe("run formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(12)).toBe("12 ms");
    expect(formatDuration(420)).toBe("0.42 s");
    expect(formatDuration(12_340)).toBe("12.3 s");
    expect(formatDuration(64_000)).toBe("1 min 4 s");
  });

  it("colours stderr as error and ends with a summary", () => {
    const result = interpretPistonResponse({ run: { stdout: "a\nb", stderr: "boom", code: 2, wall_time: 50 } }, 60);
    const lines = runResultToLines(result);
    expect(lines.slice(0, 3)).toEqual([
      { text: "a", type: "output" },
      { text: "b", type: "output" },
      { text: "boom", type: "error" },
    ]);
    expect(lines[lines.length - 1]).toEqual({ text: "Exited with code 2 after 50 ms", type: "error" });
  });
});

describe("extractProblems", () => {
  it("finds Python traceback locations", () => {
    const text = 'Traceback (most recent call last):\n  File "/piston/jobs/x/file0.code", line 3, in <module>\n    print(y)\nNameError: name \'y\' is not defined';
    expect(extractProblems(text)).toEqual([
      { message: "NameError: name 'y' is not defined", line: 3, file: "file0.code", severity: "error" },
    ]);
  });

  it("finds gcc and javac errors", () => {
    const gcc = extractProblems("main.c:4:12: error: expected ';' before 'return'\nmain.c:2:5: warning: unused variable 'x'");
    expect(gcc).toHaveLength(2);
    expect(gcc[0]).toMatchObject({ line: 4, column: 12, severity: "error" });
    expect(gcc[1]).toMatchObject({ line: 2, severity: "warning" });

    const javac = extractProblems("Main.java:5: error: cannot find symbol");
    expect(javac[0]).toMatchObject({ line: 5, message: "cannot find symbol" });
  });

  it("finds rustc errors", () => {
    const text = "error[E0425]: cannot find value `x` in this scope\n --> src/main.rs:2:20";
    expect(extractProblems(text)[0]).toMatchObject({ line: 2, column: 20, message: "cannot find value `x` in this scope" });
  });

  it("returns nothing for clean output", () => {
    expect(extractProblems("hello\nworld")).toEqual([]);
  });
});
