// Single source of truth for site-wide constants (branding, URLs, contact, social).
// Used by the navbar, footer, contact page and auth pages.
// Keep this file free of browser-only APIs (it is also imported at build time).

export const SITE_URL = "https://code.zuup.dev";
export const SITE_NAME = "Zuup Code";
export const SITE_TAGLINE = "Free online code editor & compiler";
export const SITE_DESCRIPTION =
  "Zuup Code is a free online code editor and compiler. Write, run and share Python, JavaScript, TypeScript, Java, C, C++, Go, Rust and more in your browser — no install, no setup.";

export const PARENT_SITE_URL = "https://zuup.dev";
export const ORG_NAME = "Zuup";
export const ORG_LEGAL_NAME = "Zuup (a Zylon Labs initiative)";
export const FOUNDER_NAME = "Jagrit Sachdev";

export const LOGO_URL = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

// One mailbox is used for every contact purpose until dedicated aliases exist.
// To add privacy@, abuse@, security@, dmca@ later, change only these constants.
export const CONTACT_EMAIL = "hello@zuup.dev";
export const PRIVACY_EMAIL = CONTACT_EMAIL;
export const ABUSE_EMAIL = CONTACT_EMAIL;
export const SECURITY_EMAIL = CONTACT_EMAIL;
export const DMCA_EMAIL = CONTACT_EMAIL;
export const GRIEVANCE_EMAIL = CONTACT_EMAIL;

// Shown on legal pages ("Last updated"). Bump whenever a policy's content changes.
export const LEGAL_LAST_UPDATED = "2026-10-06";
export const LEGAL_LAST_UPDATED_HUMAN = "October 6, 2026";

export const SOCIAL = {
  github: "https://github.com/jagrit0711",
  youtube: "https://www.youtube.com/@joinzuup",
  instagram: "https://www.instagram.com/joinzuup",
  substack: "https://joinzuup.substack.com/",
} as const;

// Ecosystem links used by the footer (mirrors zuup.dev's footer).
export const ECOSYSTEM_LINKS = {
  zuup: [
    { label: "Our Story", href: "https://zuup.dev/our-story" },
    { label: "Schools", href: "https://zuup.dev/schools" },
    { label: "Dashboard", href: "https://dashboard.zuup.dev" },
  ],
  ecosystem: [
    { label: "Empower", href: "https://zuup.dev/empower" },
    { label: "Events", href: "https://zuup.dev/events" },
    { label: "SaaS", href: "https://zuup.dev/saas" },
    { label: "Theming Centre", href: "https://zuup.dev/moza" },
    { label: "Surprise Me! 🎲", href: "https://zuup.dev/join" },
  ],
} as const;

// Public, indexable routes that exist today. Legal pages (privacy, terms, cookies...) are not written
// yet; add each route here, to App.tsx and to FOOTER_LEGAL_LINKS once its page exists.
export const PUBLIC_ROUTES = ["/", "/contact"] as const;

// Footer details (mirrors zuup.dev). COPYRIGHT_YEAR is a constant on purpose: computing it
// at render time would make prerendered HTML and the hydrated page disagree around New Year.
export const CONTACT_PHONE = "+91 11368172199";
export const CONTACT_PHONE_HREF = "tel:+9111368172199";
export const COPYRIGHT_YEAR = 2026;
