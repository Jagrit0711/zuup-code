import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Used for both the tooltip and the accessible name. */
  label: string;
  /** Optional shortcut shown in the tooltip, e.g. "F2". */
  shortcut?: string;
  tone?: "default" | "danger";
  size?: "sm" | "md";
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}

/** Quiet icon-only button with a tooltip, per the design system. */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, shortcut, tone = "default", size = "md", side = "top", className, children, ...props }, ref) => (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
            "hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
            "disabled:pointer-events-none disabled:opacity-40",
            tone === "danger" ? "hover:text-danger" : "hover:text-foreground",
            size === "sm" ? "h-5 w-5" : "h-6 w-6",
            className
          )}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="rounded-md border-rule bg-raised px-2 py-1 text-[12px] text-foreground shadow-float"
      >
        {label}
        {shortcut && <span className="ml-2 font-mono text-[11px] text-faint">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
);
IconButton.displayName = "IconButton";

export default IconButton;
