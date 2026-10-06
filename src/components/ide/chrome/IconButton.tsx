import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import Hint from "./Hint";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Used for both the tooltip and the accessible name. */
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

/** Quiet, icon-only toolbar button with a tooltip. */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, shortcut, side, className, children, ...rest }, ref) => (
    <Hint label={label} shortcut={shortcut} side={side}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
          "hover:bg-raised hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          "disabled:pointer-events-none disabled:opacity-40",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Hint>
  ),
);
IconButton.displayName = "IconButton";

export default IconButton;
