import { LOGO_URL, SITE_NAME } from "@/content/site";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** Show the "Zuup Code" wordmark next to the mark. */
  withText?: boolean;
  /** Hide the wordmark below the `sm` breakpoint (keeps tight navbars tidy). */
  collapseText?: boolean;
  className?: string;
}

/** Zuup mark + wordmark with the validate.zuup.dev style hover glow. Wrap in a link with the `group` class. */
export function BrandLogo({ size = 28, withText = true, collapseText = false, className }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-primary/60 opacity-0 blur-xl transition-opacity duration-700 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />
        <img
          src={LOGO_URL}
          alt=""
          width={size}
          height={size}
          decoding="async"
          className="relative z-10 rounded-md object-contain"
          style={{ width: size, height: size }}
        />
      </span>
      {withText && (
        <span className={cn("whitespace-nowrap text-[15px] tracking-tight", collapseText && "hidden sm:inline")}>
          <span className="font-semibold text-white/90 transition-colors group-hover:text-white">
            {SITE_NAME.split(" ")[0]}
          </span>{" "}
          <span className="font-light text-primary">{SITE_NAME.split(" ").slice(1).join(" ")}</span>
        </span>
      )}
    </span>
  );
}

export default BrandLogo;
