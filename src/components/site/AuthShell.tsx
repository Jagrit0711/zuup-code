import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { SiteLayout } from "./SiteLayout";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Small link row rendered under the card. */
  below?: ReactNode;
  /** false renders just the centred card on the plain background (used by the transient callback page). */
  withChrome?: boolean;
}

function Card({ title, subtitle, children, below }: Omit<AuthShellProps, "withChrome">) {
  return (
    <div className="mx-auto flex min-h-[68vh] w-full max-w-md items-center px-4 pb-16 pt-4">
      <div className="w-full">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/" aria-label="Zuup Code home" className="focus-ring group mb-6 rounded-md">
            <BrandLogo size={36} className="text-xl" />
          </Link>
          <h1 className="text-balance font-display text-3xl font-bold tracking-[-0.03em] text-white">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/55">{subtitle}</p>}
        </div>
        <div className="rounded-lg border border-white/[0.09] bg-[#14161E] p-6 sm:p-7">{children}</div>
        {below && <div className="mt-6 text-center text-xs text-white/50">{below}</div>}
      </div>
    </div>
  );
}

/** Shared frame for Login, Signup and the auth callback so they look like one family. */
export function AuthShell({ withChrome = true, ...rest }: AuthShellProps) {
  if (withChrome) {
    return (
      <SiteLayout>
        <Card {...rest} />
      </SiteLayout>
    );
  }
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0E1016] text-foreground">
      <main id="main" className="relative z-10 flex min-h-screen items-center justify-center">
        <Card {...rest} />
      </main>
    </div>
  );
}

export default AuthShell;
