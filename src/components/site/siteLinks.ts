// Navigation + footer link data for the site chrome. Pure data: no React, no browser APIs.
// Contact details, socials and ecosystem URLs come from src/content/site.ts.
import { ECOSYSTEM_LINKS } from "@/content/site";

export interface SiteLink {
  label: string;
  href: string;
}

/** In-page sections of the landing page used by the marketing navbar. `id` is the section's DOM id. */
export const MARKETING_ANCHORS = [
  { id: "features", label: "Features" },
  { id: "languages", label: "Languages" },
  { id: "github-sync", label: "GitHub Sync" },
  { id: "faq", label: "FAQ" },
] as const;

export const MARKETING_ANCHOR_IDS: readonly string[] = MARKETING_ANCHORS.map((a) => a.id);

/** Footer column "Zuup Code" (this product). */
export const FOOTER_PRODUCT_LINKS: SiteLink[] = [
  { label: "Editor", href: "/editor" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Features", href: "/#features" },
  { label: "FAQ", href: "/#faq" },
];

/** Footer column "Zuup": the parent organisation's pages (absolute URLs; own-site paths are excluded). */
export const FOOTER_ZUUP_LINKS: SiteLink[] = ECOSYSTEM_LINKS.zuup.filter((l) => /^https?:\/\//.test(l.href)) as SiteLink[];

/** Footer column "Ecosystem". */
export const FOOTER_ECOSYSTEM_LINKS: SiteLink[] = [...ECOSYSTEM_LINKS.ecosystem];

/** Footer column "Legal". Only pages that exist are listed; see PUBLIC_ROUTES in content/site.ts. */
export const FOOTER_LEGAL_LINKS: SiteLink[] = [{ label: "Contact", href: "/contact" }];

export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}
