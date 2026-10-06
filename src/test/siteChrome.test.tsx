import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

const authState = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: authState.user,
    profile: authState.user ? { id: "1", username: "dev", display_name: "Dev User", avatar_url: null } : null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
    signInWithZuup: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

import { SiteNavbar } from "@/components/site/SiteNavbar";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteLayout } from "@/components/site/SiteLayout";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import { FAQS } from "@/content/landing";
import { COPYRIGHT_YEAR, CONTACT_EMAIL } from "@/content/site";
import { languages } from "@/lib/languages";

const inRouter = (ui: ReactElement, path = "/") => <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>;

beforeEach(() => {
  authState.user = null;
});

describe("SiteNavbar", () => {
  it("shows marketing links, Sign In and the Open Editor call to action when signed out", () => {
    render(inRouter(<SiteNavbar />));
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const [name, href] of [
      ["Features", "/#features"],
      ["Languages", "/#languages"],
      ["GitHub Sync", "/#github-sync"],
      ["FAQ", "/#faq"],
    ]) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(within(nav).getByRole("link", { name: "Zuup" })).toHaveAttribute("href", "https://zuup.dev");
    expect(within(nav).getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
    expect(within(nav).getByRole("link", { name: /Open Editor/ })).toHaveAttribute("href", "/editor");
    expect(within(nav).getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("replaces Sign In with Dashboard and an account menu when signed in", () => {
    authState.user = { id: "1", email: "dev@zuup.test" };
    render(inRouter(<SiteNavbar />));
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).queryByRole("link", { name: "Sign In" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("button", { name: /Account menu/ })).toBeInTheDocument();
  });

  it("renders the compact app variant with Editor and Dashboard", () => {
    authState.user = { id: "1", email: "dev@zuup.test" };
    render(inRouter(<SiteNavbar variant="app" />, "/dashboard"));
    expect(screen.getByRole("link", { name: "Editor" })).toHaveAttribute("href", "/editor");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });
});

describe("SiteFooter", () => {
  it("links only pages that exist, and the Zuup columns", () => {
    render(inRouter(<SiteFooter />));
    const footer = screen.getByRole("contentinfo");
    expect(footer.querySelector('a[href="/contact"]')).not.toBeNull();
    // Legal policies are not written yet; linking them would lead to the 404 page.
    for (const href of ["/privacy", "/terms", "/cookies"]) {
      expect(footer.querySelector(`a[href="${href}"]`), href).toBeNull();
    }
    for (const title of ["Zuup Code", "Zuup", "Ecosystem", "Legal"]) {
      expect(within(footer).getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(within(footer).getByText("Where you get your chance.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "Email Zuup" })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  it("marks external links noopener and keeps decorative mascots hidden from assistive tech", () => {
    render(inRouter(<SiteFooter />));
    const footer = screen.getByRole("contentinfo");
    const external = footer.querySelectorAll('a[href^="https://"]');
    expect(external.length).toBeGreaterThan(4);
    external.forEach((a) => expect(a.getAttribute("rel")).toContain("noopener"));
    const mascots = footer.querySelectorAll('img[aria-hidden="true"]');
    expect(mascots).toHaveLength(3);
    mascots.forEach((img) => {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
    });
  });

  it("uses the constant copyright year", () => {
    render(inRouter(<SiteFooter />));
    expect(screen.getByRole("contentinfo")).toHaveTextContent(String(COPYRIGHT_YEAR));
  });
});

describe("SiteLayout", () => {
  it("provides a skip link, a main landmark and a footer", () => {
    render(inRouter(<SiteLayout>content</SiteLayout>));
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("minimal variant uses the app navbar and the slim footer", () => {
    authState.user = { id: "1", email: "dev@zuup.test" };
    render(inRouter(<SiteLayout variant="minimal">x</SiteLayout>));
    expect(screen.queryByText("Where you get your chance.")).toBeNull();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  });
});

describe("Landing", () => {
  it("has exactly one h1 containing 'Online Code Editor'", () => {
    render(inRouter(<Landing />));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/Online Code Editor/);
  });

  it("renders every FAQ question visibly and the anchor sections the navbar links to", () => {
    const { container } = render(inRouter(<Landing />));
    for (const { q } of FAQS) {
      expect(screen.getByText(q)).toBeInTheDocument();
    }
    for (const id of ["features", "languages", "github-sync", "faq"]) {
      expect(container.querySelector(`section#${id}`), id).not.toBeNull();
    }
  });

  it("derives the language count from languages.ts", () => {
    const runnable = languages.filter((l) => l.pistonLang !== "").length;
    render(inRouter(<Landing />));
    expect(screen.getByRole("heading", { level: 2, name: new RegExp(`Run ${runnable} languages`) })).toBeInTheDocument();
  });

  it("does not advertise project templates", () => {
    const { container } = render(inRouter(<Landing />));
    expect(container.textContent).not.toMatch(/template/i);
  });
});

describe("FAQS data", () => {
  it("has 8-10 plain-text entries", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(8);
    expect(FAQS.length).toBeLessThanOrEqual(10);
    for (const f of FAQS) {
      expect(f.q.length).toBeGreaterThan(5);
      expect(f.a).not.toMatch(/[<>]/);
    }
  });
});

describe("other restyled pages", () => {
  it("NotFound offers helpful links", () => {
    render(inRouter(<NotFound />, "/nope"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/does not exist/i);
    expect(screen.getByRole("link", { name: /Back to home/ })).toHaveAttribute("href", "/");
  });

  it("Login keeps the SSO button", () => {
    render(inRouter(<Login />, "/login"));
    expect(screen.getByRole("button", { name: /Continue with Zuup Account/ })).toBeEnabled();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("SSR safety", () => {
  it("renders Landing and SiteFooter to a string without browser APIs failing", () => {
    const landing = renderToString(
      <StaticRouter location="/">
        <Landing />
      </StaticRouter>,
    );
    expect(landing).toContain("Online Code Editor");
    expect(landing).toContain("Questions about the online code editor");
    expect(landing).toContain("/contact");

    const footer = renderToString(
      <StaticRouter location="/">
        <SiteFooter />
      </StaticRouter>,
    );
    expect(footer).toContain("Made with");
    expect(footer).toContain(String(COPYRIGHT_YEAR));
  });
});
