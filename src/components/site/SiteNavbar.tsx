import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, ChevronDown, FileCode2, Github, LayoutDashboard, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PARENT_SITE_URL, SOCIAL } from "@/content/site";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { MobileMenu, type MobileMenuItem } from "./MobileMenu";
import { MARKETING_ANCHORS, MARKETING_ANCHOR_IDS } from "./siteLinks";
import { useScrollSpy } from "./useScrollSpy";

export interface SiteNavbarProps {
  /**
   * "marketing": landing/legal/public pages (anchor links, GitHub, Sign In, "Open Editor").
   * "app": compact bar for signed-in surfaces such as the Dashboard (Editor / Dashboard / account menu).
   */
  variant?: "marketing" | "app";
  className?: string;
}

const barClass = "pointer-events-auto mx-auto flex h-16 w-full items-center justify-between gap-2";

const linkClass =
  "focus-ring group relative rounded-md px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white motion-reduce:transition-none";

function Underline({ active = false }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-x-3 -bottom-[13px] h-[2px] origin-left bg-primary transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none",
        active ? "scale-x-100" : "scale-x-0",
      )}
    />
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "U").slice(0, 2);
  return letters.toUpperCase();
}

function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Account";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className={cn(
            "focus-ring group inline-flex h-10 items-center gap-1 rounded-md pl-1 pr-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white",
            compact ? "" : "max-md:hidden",
          )}
        >
          <Avatar className="h-8 w-8 border border-white/10">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-primary/20 text-[11px] font-semibold text-primary">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown size={14} aria-hidden="true" className="opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="z-[70] w-56 rounded-lg border-white/10 bg-[#0a0b10]/95 p-1.5 text-white backdrop-blur-xl"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {user?.email && <span className="block truncate text-xs font-normal text-white/50">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md px-3 py-2 focus:bg-white/10 focus:text-white">
          <Link to="/dashboard">
            <LayoutDashboard size={15} aria-hidden="true" /> Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md px-3 py-2 focus:bg-white/10 focus:text-white">
          <Link to="/editor">
            <FileCode2 size={15} aria-hidden="true" /> Editor
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          onSelect={() => void handleSignOut()}
          className="cursor-pointer gap-2 rounded-md px-3 py-2 focus:bg-white/10 focus:text-white"
        >
          <LogOut size={15} aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Full-width top bar with a hairline bottom edge, fixed to the top of the viewport.
 * It is `position: fixed`, so pages need ~6rem of top padding (SiteLayout adds it).
 * SSR-safe: nothing here touches window/document during render.
 */
export function SiteNavbar({ variant = "marketing", className }: SiteNavbarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onHome = pathname === "/";
  const activeAnchor = useScrollSpy(MARKETING_ANCHOR_IDS, variant === "marketing" && onHome);

  if (variant === "app") {
    return (
      <header className={cn("fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#0E1016]/85 backdrop-blur-md", className)}>
        <nav aria-label="Primary" className={cn(barClass, "max-w-6xl px-4 sm:px-6 lg:px-8")}>
          <Link to="/" aria-label="Zuup Code home" className="focus-ring group rounded-md">
            <BrandLogo collapseText />
          </Link>
          <ul className="flex items-center gap-0.5">
            {[
              { to: "/editor", label: "Editor" },
              { to: "/dashboard", label: "Dashboard" },
            ].map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className={cn(linkClass, pathname.startsWith(l.to) && "text-white")}
                  aria-current={pathname.startsWith(l.to) ? "page" : undefined}
                >
                  {l.label}
                  <Underline active={pathname.startsWith(l.to)} />
                </Link>
              </li>
            ))}
          </ul>
          {user ? (
            <AccountMenu compact />
          ) : (
            <Link
              to="/login"
              className="focus-ring rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Sign In
            </Link>
          )}
        </nav>
      </header>
    );
  }

  const mobileItems: MobileMenuItem[] = [
    ...MARKETING_ANCHORS.map((a) => ({
      label: a.label,
      to: `/#${a.id}`,
      active: onHome && activeAnchor === a.id,
    })),
    { label: "Zuup", href: PARENT_SITE_URL, newTab: true },
    { label: "GitHub", href: SOCIAL.github, newTab: true },
  ];

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#0E1016]/85 backdrop-blur-md", className)}>
      <nav aria-label="Primary" className={cn(barClass, "max-w-6xl px-4 sm:px-6 lg:px-8")}>
        <Link to="/" aria-label="Zuup Code home" className="focus-ring group rounded-md">
          <BrandLogo />
        </Link>

        <ul className="hidden items-center gap-0.5 md:flex">
          {MARKETING_ANCHORS.map((a) => (
            <li key={a.id}>
              <Link
                to={`/#${a.id}`}
                className={cn(linkClass, onHome && activeAnchor === a.id && "text-white")}
                aria-current={onHome && activeAnchor === a.id ? "location" : undefined}
              >
                {a.label}
                <Underline active={onHome && activeAnchor === a.id} />
              </Link>
            </li>
          ))}
          <li>
            <a href={PARENT_SITE_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <span className="inline-flex items-center gap-1">
                Zuup <ArrowUpRight size={13} aria-hidden="true" className="opacity-60" />
              </span>
              <Underline />
            </a>
          </li>
        </ul>

        <div className="flex items-center gap-1">
          <a
            href={SOCIAL.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Zuup on GitHub"
            className="focus-ring hidden h-10 w-10 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
          >
            <Github size={18} aria-hidden="true" />
          </a>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="focus-ring hidden rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white md:inline-block"
              >
                Dashboard
              </Link>
              <AccountMenu />
            </>
          ) : (
            <Link
              to="/login"
              className="focus-ring hidden rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white md:inline-block"
            >
              Sign In
            </Link>
          )}
          <Link
            to="/editor"
            className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open Editor
                      </Link>
          <MobileMenu
            items={mobileItems}
            secondary={
              user
                ? [
                    { label: "Dashboard", to: "/dashboard" },
                    {
                      label: "Sign out",
                      onSelect: () => {
                        void signOut().then(() => navigate("/"));
                      },
                    },
                  ]
                : [{ label: "Sign In", to: "/login" }]
            }
            primary={{ label: "Open Editor", to: "/editor" }}
          />
        </div>
      </nav>
    </header>
  );
}

export default SiteNavbar;
