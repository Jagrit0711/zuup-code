import { useCallback, useEffect, useRef, useState } from "react";

export type RunStartResult<T> =
  | { status: "done"; value: T }
  /** Another run was still going; nothing was started. */
  | { status: "busy" };

/**
 * Owns the one in-flight code run: a synchronous "busy" flag (so a double click or a quick second
 * Ctrl/Cmd+Enter cannot start two runs before React re-renders), the AbortController behind the
 * Stop button, and cleanup when the editor unmounts.
 */
export function useRunController() {
  const [isRunning, setIsRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(async <T,>(task: (signal: AbortSignal) => Promise<T>): Promise<RunStartResult<T>> => {
    if (controllerRef.current) return { status: "busy" };
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRunning(true);
    try {
      return { status: "done", value: await task(controller.signal) };
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsRunning(false);
      }
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  /** Read at call time, unlike `isRunning`, which only updates after a render. */
  const isBusy = useCallback(() => controllerRef.current !== null, []);

  // Never leave a run going after the editor closes.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    []
  );

  return { isRunning, start, stop, isBusy };
}
