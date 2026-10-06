/** Shared button classes from the design system, so the dialogs stay consistent. */
export const buttonClass = {
  primary:
    "inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-raised",
  secondary:
    "inline-flex h-8 items-center justify-center rounded-md border border-rule bg-transparent px-3 text-[13px] text-foreground transition-colors hover:bg-ink/60 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
  quiet:
    "inline-flex h-8 items-center justify-center rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-ink/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
} as const;

export const inputClass =
  "h-8 w-full rounded-md border border-rule bg-ink px-2.5 text-[13px] text-foreground placeholder:text-faint transition-colors focus-visible:border-primary/60 focus-visible:outline-none";
