/** Shared class names for the GitHub dialogs (see docs/DESIGN.md, Controls). */
const focus = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

export const inputClass = `h-8 w-full rounded-md border border-rule bg-ink px-2.5 text-[13px] text-foreground placeholder:text-faint focus-visible:border-primary/60 ${focus}`;
export const primaryButtonClass = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 ${focus} focus-visible:ring-offset-2 focus-visible:ring-offset-raised`;
export const secondaryButtonClass = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-rule bg-transparent px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-ink disabled:pointer-events-none disabled:opacity-50 ${focus}`;
export const dangerButtonClass = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-rule bg-transparent px-3 text-[13px] font-medium text-danger transition-colors duration-150 hover:border-danger/50 hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-50 ${focus}`;
/** Text-only link-style button. */
export const linkButtonClass = `rounded-sm text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50 ${focus}`;
/** Dialog surface shared by the GitHub and conflict dialogs. */
export const dialogSurfaceClass = "gap-0 rounded-lg border border-rule bg-raised p-0 shadow-float";
export const dialogTitleClass = "font-display text-[17px] font-bold tracking-[-0.02em] text-foreground";
export const menuSurfaceClass = "rounded-lg border-rule bg-raised p-1 text-[13px] shadow-float";
export const menuItemClass = "rounded-md px-2 py-1.5 text-[13px]";
