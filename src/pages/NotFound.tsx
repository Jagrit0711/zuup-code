import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { usePageMeta } from "@/hooks/usePageMeta";

// The SPA answers every unknown URL with index.html and status 200, so the page itself marks the
// response as noindex. The hosting layer should also return a real 404 status where it can.

const HELPFUL_LINKS = [
  { to: "/editor", title: "Open the editor", desc: "Start a new project and run code." },
  { to: "/#languages", title: "Supported languages", desc: "See what you can run online." },
  { to: "/#faq", title: "Frequently asked questions", desc: "Quick answers about Zuup Code." },
  { to: "/contact", title: "Contact us", desc: "Tell us about a broken link." },
];

const NotFound = () => {
  usePageMeta({ title: "Page not found", noindex: true });

  return (
    <SiteLayout>
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-12 sm:px-6 lg:px-8">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="mt-3 max-w-2xl text-balance font-display text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl">
          This page does not exist
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-[#8B90A0] sm:text-lg">
          The link may be broken or the page may have moved. Here are some places that do exist.
        </p>

        <Link
          to="/"
          className="focus-ring mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to home
        </Link>

        <ul className="mt-14 grid max-w-3xl border-t border-white/[0.09] sm:grid-cols-2 sm:gap-x-10">
          {HELPFUL_LINKS.map((l) => (
            <li key={l.to} className="border-b border-white/[0.09]">
              <Link to={l.to} className="focus-ring group flex items-center justify-between gap-4 rounded py-4">
                <span>
                  <span className="block text-[15px] font-semibold text-white">{l.title}</span>
                  <span className="mt-0.5 block text-sm text-[#8B90A0]">{l.desc}</span>
                </span>
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-white/30 transition-colors group-hover:text-primary motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </SiteLayout>
  );
};

export default NotFound;
