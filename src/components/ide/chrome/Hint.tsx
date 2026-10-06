import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HintProps {
  label: string;
  /** Keyboard shortcut shown after the label, e.g. "Ctrl+Enter". */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

/** Small tooltip used across the IDE chrome: a label, and a shortcut in mono when there is one. */
const Hint = ({ label, shortcut, side = "bottom", children }: HintProps) => (
  <Tooltip delayDuration={400}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent
      side={side}
      sideOffset={6}
      className={cn(
        "flex items-center gap-2 rounded-md border-rule bg-raised px-2 py-1 text-[12px] text-foreground shadow-float",
        "motion-reduce:animate-none",
      )}
    >
      <span>{label}</span>
      {shortcut && <span className="font-mono text-[11px] text-faint">{shortcut}</span>}
    </TooltipContent>
  </Tooltip>
);

export default Hint;
