import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { cn } from "@/lib/utils";

export interface MobileMenuItem {
  label: string;
  /** Internal route (react-router). */
  to?: string;
  /** External URL (opens in the same tab unless `newTab`). */
  href?: string;
  newTab?: boolean;
  /** Button behaviour for items that are actions (e.g. "Sign out"). */
  onSelect?: () => void;
  active?: boolean;
}

interface MobileMenuProps {
  /** Main navigation links. */
  items: MobileMenuItem[];
  /** Account / secondary actions rendered below the main links. */
  secondary?: MobileMenuItem[];
  /** The primary call to action pinned at the bottom. */
  primary: MobileMenuItem;
  className?: string;
}

const rowClass =
  "focus-ring flex w-full items-center justify-between rounded-md px-4 py-3.5 text-left text-base font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white aria-[current=location]:bg-white/10 aria-[current=location]:text-white";

function Row({ item }: { item: MobileMenuItem }) {
  const current = item.active ? "location" : undefined;
  if (item.to) {
    return (
      <Dialog.Close asChild>
        <Link to={item.to} className={rowClass} aria-current={current}>
          {item.label}
        </Link>
      </Dialog.Close>
    );
  }
  if (item.href) {
    return (
      <Dialog.Close asChild>
        <a
          href={item.href}
          className={rowClass}
          {...(item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {item.label}
          <ArrowUpRight size={16} aria-hidden="true" className="text-white/40" />
        </a>
      </Dialog.Close>
    );
  }
  return (
    <Dialog.Close asChild>
      <button type="button" className={rowClass} onClick={item.onSelect}>
        {item.label}
      </button>
    </Dialog.Close>
  );
}

/**
 * Full-width sheet for small screens. Built on Radix Dialog, which provides the focus trap,
 * Esc to close, focus return to the trigger and `aria-expanded` on the trigger button.
 */
export function MobileMenu({ items, secondary = [], primary, className }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  // Close the sheet if the viewport grows past the breakpoint where the desktop pill takes over.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className={cn(
            "focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden",
            className,
          )}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-3 top-3 z-[61] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-y-auto rounded-[28px] border border-white/10 bg-[#0a0b10]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-4 motion-reduce:animate-none md:hidden"
        >
          <Dialog.Title className="sr-only">Site menu</Dialog.Title>
          <div className="flex h-12 items-center justify-between pl-3 pr-1">
            <Dialog.Close asChild>
              <Link to="/" className="focus-ring group rounded-md" aria-label="Zuup Code home">
                <BrandLogo />
              </Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <nav aria-label="Mobile" className="mt-2 flex flex-col gap-0.5">
            {items.map((item) => (
              <Row key={item.label} item={item} />
            ))}
          </nav>

          {secondary.length > 0 && (
            <div className="mt-3 flex flex-col gap-0.5 border-t border-white/10 pt-3">
              {secondary.map((item) => (
                <Row key={item.label} item={item} />
              ))}
            </div>
          )}

          <div className="mt-4 px-1 pb-1">
            <Dialog.Close asChild>
              <Link
                to={primary.to ?? "/editor"}
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground"
              >
                {primary.label}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MobileMenu;
