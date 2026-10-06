import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRunController } from "@/hooks/useRunController";
import { combineProblemCounts, countProblems, problemsFromRunLines } from "@/hooks/problemCounts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useRunController", () => {
  it("reports busy synchronously, before React re-renders", async () => {
    const { result } = renderHook(() => useRunController());
    const d = deferred<string>();
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.start(() => d.promise);
    });
    // A second run in the same tick (double click, file click then Run) is refused, not lost.
    expect(result.current.isBusy()).toBe(true);
    const second = await result.current.start(async () => "second");
    expect(second).toEqual({ status: "busy" });
    expect(result.current.isRunning).toBe(true);
    await act(async () => {
      d.resolve("first");
      await first;
    });
    await expect(first).resolves.toEqual({ status: "done", value: "first" });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isBusy()).toBe(false);
  });

  it("starts a new run as soon as the previous one settles", async () => {
    const { result } = renderHook(() => useRunController());
    await act(async () => {
      await result.current.start(async () => 1);
    });
    let next: unknown;
    await act(async () => {
      next = await result.current.start(async () => 2);
    });
    expect(next).toEqual({ status: "done", value: 2 });
  });

  it("clears the busy flag when the task throws", async () => {
    const { result } = renderHook(() => useRunController());
    await act(async () => {
      await expect(result.current.start(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    });
    expect(result.current.isBusy()).toBe(false);
    expect(result.current.isRunning).toBe(false);
  });

  it("stop aborts only the current run's signal", async () => {
    const { result } = renderHook(() => useRunController());
    let signal!: AbortSignal;
    const d = deferred<void>();
    let run!: Promise<unknown>;
    act(() => {
      run = result.current.start((s) => {
        signal = s;
        return d.promise;
      });
    });
    act(() => result.current.stop());
    expect(signal.aborted).toBe(true);
    await act(async () => {
      d.resolve();
      await run;
    });
    let nextSignal!: AbortSignal;
    await act(async () => {
      await result.current.start(async (s) => {
        nextSignal = s;
      });
    });
    expect(nextSignal.aborted).toBe(false);
  });

  it("aborts an in-flight run on unmount", () => {
    const { result, unmount } = renderHook(() => useRunController());
    let signal!: AbortSignal;
    act(() => {
      void result.current.start((s) => {
        signal = s;
        return new Promise(() => {});
      });
    });
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe("problem counts", () => {
  const traceback = [
    { text: "Traceback (most recent call last):", type: "error" },
    { text: '  File "main.py", line 3, in <module>', type: "error" },
    { text: "NameError: name 'x' is not defined", type: "error" },
    { text: "Exited with code 1 after 0.10 s", type: "error" },
  ];

  it("finds the same problems the Problems tab lists", () => {
    const problems = problemsFromRunLines(traceback);
    expect(problems.length).toBeGreaterThan(0);
    expect(countProblems(problems).errors).toBe(problems.filter((p) => p.severity === "error").length);
  });

  it("ignores output without error lines", () => {
    expect(problemsFromRunLines([{ text: "error: just a word in output", type: "output" }])).toEqual([]);
  });

  it("adds editor markers to run problems", () => {
    expect(combineProblemCounts({ errors: 1, warnings: 0 }, { errors: 2, warnings: 3 })).toEqual({ errors: 3, warnings: 3 });
    expect(combineProblemCounts({ errors: 1, warnings: 0 }, null)).toEqual({ errors: 1, warnings: 0 });
  });
});
