import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title, set in the display face. */
  title: ReactNode;
  /** One line under the title. Always given to screen readers; shown unless `hideDescription`. */
  description?: ReactNode;
  hideDescription?: boolean;
  /** Hide the visual header entirely (the title stays available to screen readers). */
  bare?: boolean;
  children: ReactNode;
  className?: string;
  /** Vertical placement: centred, or near the top like a command palette. */
  placement?: "center" | "top";
  onOpenAutoFocus?: (e: Event) => void;
  showClose?: boolean;
}

/**
 * The one dialog frame used by the editor's own dialogs: raised surface, hairline border, the
 * float shadow, a display-face title and a quiet close button. Built on Radix so focus is
 * trapped, Escape closes, and focus returns to whatever opened it.
 */
const ModalShell = ({
  open,
  onOpenChange,
  title,
  description,
  hideDescription,
  bare,
  children,
  className,
  placement = "center",
  onOpenAutoFocus,
  showClose = true,
}: ModalShellProps) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
      <DialogPrimitive.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed inset-x-0 z-50 mx-auto flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-rule bg-raised text-foreground shadow-float outline-none",
          "duration-150 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none",
          placement === "center" ? "inset-y-0 my-auto h-fit max-h-[min(88vh,44rem)]" : "top-[12vh] max-h-[76vh]",
          className,
        )}
      >
        {bare ? (
          <>
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
            ) : null}
          </>
        ) : (
          <div className="shrink-0 px-6 pb-4 pt-5 pr-14">
            <DialogPrimitive.Title className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description
                className={cn("mt-1 text-[13px] leading-relaxed text-muted-foreground", hideDescription && "sr-only")}
              >
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
        )}
        {!description && !bare ? <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description> : null}
        {children}
        {showClose && !bare ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-ink/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <X size={15} aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export default ModalShell;
