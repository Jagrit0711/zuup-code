import { Link } from "react-router-dom";
import { FileText, Github, Heart, Instagram, Mail, Youtube, ArrowUpRight, type LucideIcon } from "lucide-react";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_HREF,
  COPYRIGHT_YEAR,
  LOGO_URL,
  PARENT_SITE_URL,
  SITE_NAME,
  SOCIAL,
} from "@/content/site";
import { cn } from "@/lib/utils";
import {
  FOOTER_ECOSYSTEM_LINKS,
  FOOTER_LEGAL_LINKS,
  FOOTER_PRODUCT_LINKS,
  FOOTER_ZUUP_LINKS,
  isExternalHref,
  type SiteLink,
} from "./siteLinks";

const MASCOT_BASE = `${PARENT_SITE_URL}`;

const SOCIALS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Zuup on GitHub", href: SOCIAL.github, icon: Github },
  { label: "Zuup on YouTube", href: SOCIAL.youtube, icon: Youtube },
  { label: "Zuup on Instagram", href: SOCIAL.instagram, icon: Instagram },
  { label: "Zuup newsletter on Substack", href: SOCIAL.substack, icon: FileText },
  { label: "Email Zuup", href: `mailto:${CONTACT_EMAIL}`, icon: Mail },
];

const linkClass =
  "focus-ring group inline-flex items-center gap-2 rounded-sm text-gray-400 transition-colors hover:text-white motion-reduce:transition-none";

function FooterLink({ link }: { link: SiteLink }) {
  if (isExternalHref(link.href)) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {link.label}
        <ArrowUpRight
          size={13}
          aria-hidden="true"
          className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-60 motion-reduce:transition-none"
        />
      </a>
    );
  }
  return (
    <Link to={link.href} className={linkClass}>
      {link.label}
    </Link>
  );
}

function Column({ title, links }: { title: string; links: SiteLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-6 text-lg font-bold tracking-wide text-white">{title}</h2>
      <ul className="space-y-3.5 text-[15px] font-medium">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <FooterLink link={l} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Mascot({ name, className }: { name: string; className: string }) {
  return (
    <img
      src={`${MASCOT_BASE}/moza-${name}-inverted.png`}
      alt=""
      aria-hidden="true"
      width={1024}
      height={1024}
      loading="lazy"
      decoding="async"
      className={cn("pointer-events-none absolute z-0 select-none object-contain", className)}
    />
  );
}

/**
 * Site footer, a faithful adaptation of the zuup.dev footer: black, 40px grid overlay, faint mascots,
 * Caveat tagline, circular social links and a "made by teens" bar. SSR-safe (no browser APIs, no
 * render-time dates: the year is COPYRIGHT_YEAR).
 *
 * `compact` renders only the slim bottom bar (used by SiteLayout variant="minimal").
 */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const bottomBar = (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-4 font-mono text-sm text-gray-400 md:flex-row",
        compact ? "" : "mt-16 border-t border-gray-800 pt-8 md:mt-20",
      )}
    >
      <p>
        &copy; {COPYRIGHT_YEAR} Zuup. {SITE_NAME} is a Zuup initiative.
      </p>
      <p className="flex items-center gap-1.5">
        Made with <Heart size={14} aria-hidden="true" className="fill-[#FF6D59] text-[#FF6D59]" />
        <span className="sr-only">love</span> by teens
      </p>
    </div>
  );

  if (compact) {
    return (
      <footer className="relative border-t border-white/10 bg-black px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-gray-400 md:justify-start">
            {FOOTER_LEGAL_LINKS.map((l) => (
              <Link key={l.href} to={l.href} className={linkClass}>
                {l.label}
              </Link>
            ))}
          </nav>
          {bottomBar}
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-black text-gray-400">
      {/* 40px grid overlay */}
      <div aria-hidden="true" className="bg-grid-40 pointer-events-none absolute inset-0 opacity-[0.05]" />

      {/* Decorative mascots */}
      <Mascot name="laptop" className="-right-6 -top-6 h-48 w-48 rotate-6 opacity-10 md:h-80 md:w-80 md:opacity-20" />
      <Mascot
        name="graduate"
        className="-bottom-10 -left-10 h-56 w-56 -rotate-12 opacity-[0.08] md:h-96 md:w-96 md:opacity-[0.15]"
      />
      <Mascot
        name="coffee"
        className="bottom-0 right-1/4 h-40 w-40 rotate-12 opacity-10 md:h-64 md:w-64 md:opacity-[0.15]"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4 md:gap-8 lg:grid-cols-6">
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            <Link to="/" aria-label={`${SITE_NAME} home`} className="focus-ring mb-6 inline-block rounded-md">
              <img src={LOGO_URL} alt="Zuup logo" width={56} height={56} loading="lazy" className="h-14 w-14 rounded-lg" />
            </Link>
            <p className="mb-1 font-hand text-2xl font-medium tracking-[1px] text-white">Where you get your chance.</p>
            <p className="mb-2 max-w-xs text-sm text-gray-500">
              {SITE_NAME} is a free online code editor from Zuup, a youth-led non-profit.
            </p>
            <p className="mb-6 font-mono text-sm text-gray-500">
              <a href={CONTACT_PHONE_HREF} className="focus-ring rounded-sm transition-colors hover:text-white">
                {CONTACT_PHONE}
              </a>
            </p>
            <ul className="flex flex-wrap gap-3" aria-label="Zuup on the web">
              {SOCIALS.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    aria-label={label}
                    {...(href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                    className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-gray-800 bg-black text-gray-400 transition-all hover:border-gray-500 hover:text-white motion-reduce:transition-none"
                  >
                    <Icon size={18} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <Column title={SITE_NAME} links={FOOTER_PRODUCT_LINKS} />
          <Column title="Zuup" links={FOOTER_ZUUP_LINKS} />
          <Column title="Ecosystem" links={FOOTER_ECOSYSTEM_LINKS} />
          <Column title="Legal" links={FOOTER_LEGAL_LINKS} />
        </div>

        {bottomBar}
      </div>
    </footer>
  );
}

export default SiteFooter;
