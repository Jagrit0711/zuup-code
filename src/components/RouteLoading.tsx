/**
 * Quiet loading state for lazy routes and auth checks: a thin line along the top of the page and
 * a screen-reader label. No logo, no spinner.
 */
export function RouteLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="min-h-screen bg-background">
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-rule">
        <div className="h-full w-1/3 animate-pulse bg-primary/70 motion-reduce:animate-none" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default RouteLoading;
