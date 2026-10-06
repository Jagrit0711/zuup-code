import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/bootRecovery";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the children after an error. `reset` re-renders the children. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called after `reset`, e.g. to clear state that caused the crash. */
  onReset?: () => void;
  /** Re-mount the children when any of these values change after an error (e.g. the open project id). */
  resetKeys?: readonly unknown[];
  /** Short name used in the console message, e.g. "editor". */
  name?: string;
}

interface State {
  error: Error | null;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

/**
 * Keeps a crash in one part of the app (Monaco, a panel, a page) from blanking everything else.
 * Without a `fallback` it shows a short message with a "Try again" button.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name ?? "app"}] crashed`, error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => {
    // React.lazy caches a failed import, so re-rendering cannot recover a missing chunk; reload instead.
    if (this.state.error && isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div role="alert" className="flex h-full min-h-[12rem] w-full items-center justify-center bg-ink p-6">
        <div className="max-w-sm">
          <p className="text-[15px] font-semibold text-foreground">This part of Zuup Code stopped working</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Your files are safe. Try again, and reload the page if it keeps happening.
          </p>
          <p className="mt-3 break-words font-mono text-[11px] text-faint">{error.message}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-8 rounded-md border border-rule px-3 text-[13px] text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
