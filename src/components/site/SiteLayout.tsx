import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SiteFooter } from "./SiteFooter";
import { SiteNavbar } from "./SiteNavbar";

/**
 * Page shell for every public/marketing-style page: skip link + floating navbar + <main id="main">
 * + footer.
 *
 * Props
 *  - variant   "default" (default): marketing navbar and the full zuup.dev style footer.
 *              "minimal": compact "app" navbar (Editor / Dashboard / account) and a slim footer bar.
 *              Use it for signed-in surfaces such as the Dashboard.
 *  - padTop    Reserve space under the fixed navbar (default true). The landing page passes false so
 *              its hero can run behind the navbar.
 *  - className / mainClassName  Extra classes for the outer wrapper / the <main> element.
 *
 * The navbar uses useAuth(), so render this inside <AuthProvider>.
 */
export interface SiteLayoutProps {
  variant?: "default" | "minimal";
  padTop?: boolean;
  className?: string;
  mainClassName?: string;
  children: ReactNode;
}

function focusMain(e: React.MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById("main");
  if (!main) return;
  e.preventDefault();
  main.focus({ preventScroll: true });
  main.scrollIntoView();
}

export function SiteLayout({ variant = "default", padTop = true, className, mainClassName, children }: SiteLayoutProps) {
  const minimal = variant === "minimal";
  return (
    <div className={cn("relative flex min-h-screen flex-col overflow-x-clip bg-[#0E1016] text-foreground", className)}>
      <a
        href="#main"
        onClick={focusMain}
        className="focus-ring fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to main content
      </a>

      <SiteNavbar variant={minimal ? "app" : "marketing"} />

      <main id="main" tabIndex={-1} className={cn("relative z-10 flex-1 focus:outline-none", padTop && "pt-24", mainClassName)}>
        {children}
      </main>

      <SiteFooter compact={minimal} />
    </div>
  );
}

export default SiteLayout;
