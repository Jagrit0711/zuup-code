import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Cloud,
  Code2,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  Heart,
  Keyboard,
  Link2,
  Lock,
  Play,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { languages } from "@/lib/languages";
import { PARENT_SITE_URL, SITE_NAME } from "@/content/site";
import {
  AUDIENCES,
  FAQS,
  FEATURES,
  GITHUB_SYNC_POINTS,
  HERO_CHIPS,
  MISSION,
  SHARING_POINTS,
  STEPS,
  type FeatureIcon,
} from "@/content/landing";

const FEATURE_ICONS: Record<FeatureIcon, LucideIcon> = {
  play: Play,
  code: Code2,
  folders: FolderTree,
  globe: Globe,
  cloud: Cloud,
  keyboard: Keyboard,
  lock: Lock,
  heart: Heart,
};

/* ─────────────────────────── shared styles ─────────────────────────── */

const shell = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const sectionClass = "scroll-mt-20 border-t border-white/[0.07] py-20 md:py-28";
const muted = "text-[#8B90A0]";

const primaryButton =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90";
const secondaryButton =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-5 py-3 text-[15px] font-medium text-white/85 transition-colors hover:border-white/35 hover:text-white";

/** Colour helpers for the static syntax-highlighted mocks. */
const kw = "text-[#c792ea]";
const fn = "text-[#82aaff]";
const str = "text-[#c3e88d]";
const arg = "text-[#f78c6c]";
const punct = "text-white/45";

/**
 * Section heading for the left column of the two-column section layout. Headings are left aligned and
 * sit on the same vertical line as the hero, so the page reads down one edge.
 */
function SectionHeading({ id, title, children }: { id: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-md">
      <h2
        id={id}
        className="text-balance font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.025em] text-white sm:text-[2.6rem]"
      >
        {title}
      </h2>
      {children && <p className={`mt-5 text-pretty text-base leading-relaxed sm:text-[17px] ${muted}`}>{children}</p>}
    </div>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

const DEMO_CODE: ReactNode[] = [
  <>
    <span className={kw}>def</span> <span className={fn}>greet</span>
    <span className={punct}>(</span>
    <span className={arg}>name</span>
    <span className={punct}>):</span>
  </>,
  <>
    {"    "}
    <span className={kw}>return</span> <span className={punct}>f</span>
    <span className={str}>"Hello, </span>
    <span className={punct}>{"{"}</span>
    <span className={arg}>name</span>
    <span className={punct}>{"}"}</span>
    <span className={str}>!"</span>
  </>,
  <></>,
  <>
    <span className={kw}>for</span> lang <span className={kw}>in</span> <span className={punct}>[</span>
    <span className={str}>"Python"</span>
    <span className={punct}>,</span> <span className={str}>"C++"</span>
    <span className={punct}>,</span> <span className={str}>"Java"</span>
    <span className={punct}>]:</span>
  </>,
  <>
    {"    "}
    <span className={fn}>print</span>
    <span className={punct}>(</span>
    <span className={fn}>greet</span>
    <span className={punct}>(</span>lang<span className={punct}>))</span>
  </>,
];

const DEMO_OUTPUT = ["Hello, Python!", "Hello, C++!", "Hello, Java!"];
/** Output lines plus the closing exit-code line. */
const DEMO_STEPS = DEMO_OUTPUT.length + 1;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * The editor as the hero: a small program whose output prints once when the page loads. The Run
 * button is real and prints it again, so the first thing a visitor can do on the page is what the
 * product does.
 */
function EditorDemo() {
  const [shown, setShown] = useState(0);
  const timers = useRef<number[]>([]);

  const run = useCallback((delay: number) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (prefersReducedMotion()) {
      setShown(DEMO_STEPS);
      return;
    }
    setShown(0);
    for (let i = 1; i <= DEMO_STEPS; i++) {
      timers.current.push(window.setTimeout(() => setShown(i), delay + i * 280));
    }
  }, []);

  useEffect(() => {
    run(500);
    // Read the ref at cleanup time: pressing Run replaces the array.
    const pending = timers;
    return () => pending.current.forEach((t) => window.clearTimeout(t));
  }, [run]);

  const running = shown < DEMO_STEPS;

  return (
    <figure className="relative w-full text-left lg:-mr-16 xl:-mr-28">
      <figcaption className="sr-only">
        Example in the {SITE_NAME} editor: a short Python program and its output, three greeting lines.
      </figcaption>
      <div className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#0A0C11] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        {/* tab strip, styled like the editor's own */}
        <div className="flex items-stretch border-b border-white/[0.07] bg-[#12141B] font-mono text-xs">
          <span className="border-t-2 border-primary bg-[#0A0C11] px-4 py-2.5 text-white/90">main.py</span>
          <span className="hidden border-t-2 border-transparent px-4 py-2.5 text-white/35 sm:inline">notes.md</span>
          <button
            type="button"
            onClick={() => run(0)}
            className="focus-ring my-1.5 ml-auto mr-2 inline-flex items-center gap-1.5 rounded bg-primary px-3 font-sans text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            aria-label="Run the example program again"
          >
            {running ? <Play size={11} fill="currentColor" aria-hidden="true" /> : <RotateCcw size={11} aria-hidden="true" />}
            Run
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div aria-hidden="true" className="overflow-x-auto whitespace-pre p-4 font-mono text-[12.5px] leading-7 sm:p-5 sm:text-[13px]">
            {DEMO_CODE.map((line, i) => (
              <div key={i} className="flex">
                <span className="w-7 shrink-0 select-none pr-3 text-right text-white/20">{i + 1}</span>
                <span className="text-white/85">{line}</span>
              </div>
            ))}
            <div className="flex">
              <span className="w-7 shrink-0 select-none pr-3 text-right text-white/20">{DEMO_CODE.length + 1}</span>
              <span className="inline-block h-[18px] w-[2px] translate-y-[5px] animate-caret-blink bg-primary motion-reduce:animate-none" />
            </div>
          </div>

          <div className="min-h-[11rem] border-t border-white/[0.07] bg-black/30 p-4 font-mono text-[12.5px] leading-7 sm:p-5 md:border-l md:border-t-0">
            <div className="text-white/55">$ python main.py</div>
            {DEMO_OUTPUT.map((line, i) => (
              <div key={line} className={i < shown ? "text-white/85" : "invisible"}>
                {line}
              </div>
            ))}
            <div className={`mt-2 flex items-center gap-2 text-[#3DDC84] ${shown >= DEMO_STEPS ? "" : "invisible"}`}>
              <Check size={13} aria-hidden="true" /> exit code 0
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="pb-20 pt-28 sm:pt-36 md:pb-28">
      <div className={`${shell} grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:gap-12`}>
        <div>
          <h1
            id="hero-title"
            className="text-balance font-display text-[2.9rem] font-extrabold leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.4rem]"
          >
            Free Online Code Editor that just runs.
          </h1>

          <p className={`mt-6 max-w-[34rem] text-pretty text-[17px] leading-relaxed sm:text-lg ${muted}`}>
            Write, run and share Python, JavaScript, C++, Java and more right in your browser. Real execution, no
            install and no setup.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/editor" className={primaryButton}>
              Open the editor
            </Link>
            <Link to="/#languages" className={secondaryButton}>
              See supported languages
            </Link>
          </div>

          <ul className={`mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm ${muted}`}>
            {HERO_CHIPS.map((chip) => (
              <li key={chip} className="flex items-start gap-2">
                <Check size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                {chip}
              </li>
            ))}
          </ul>

          <a
            href={PARENT_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`focus-ring mt-10 inline-flex items-center gap-1 rounded text-sm underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-primary ${muted}`}
          >
            A Zuup initiative
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>

        <EditorDemo />
      </div>
    </section>
  );
}

/* ─────────────────────────── features ─────────────────────────── */

function TerminalSnippet() {
  return (
    <div
      aria-hidden="true"
      className="rounded-md border border-white/[0.07] bg-[#0A0C11] p-4 font-mono text-[12.5px] leading-6 text-white/70"
    >
      <div className="text-white/35">$ run main.cpp</div>
      <div>
        Enter a number: <span className="text-primary">12</span>
      </div>
      <div>12 x 12 = 144</div>
      <div className="mt-1 text-[#3DDC84]">exit code 0</div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className={sectionClass}>
      <div className={`${shell} grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading id="features-title" title="Everything an online code editor should have">
            A complete coding workspace in a browser tab. No downloads, no configuration and nothing to pay for.
          </SectionHeading>
        </div>

        <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = FEATURE_ICONS[f.icon];
            return (
              <div
                key={f.id}
                className={`border-t border-white/[0.09] pb-9 pt-5 ${f.wide ? "grid grid-cols-1 gap-6 sm:col-span-2 md:grid-cols-2" : ""}`}
              >
                <div>
                  <dt className="flex items-center gap-2.5 text-[17px] font-semibold text-white">
                    <Icon size={17} aria-hidden="true" className="shrink-0 text-primary" />
                    {f.title}
                  </dt>
                  <dd className={`mt-2 text-[15px] leading-relaxed ${muted}`}>{f.description}</dd>
                </div>
                {f.id === "execution" && <TerminalSnippet />}
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

/* ─────────────────────────── languages ─────────────────────────── */

/** A language list laid out like a directory listing: name on the left, file extension on the right. */
function LanguageListing({ title, items, dim = false }: { title: string; items: typeof languages; dim?: boolean }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-white">
        {title} <span className={`font-normal ${muted}`}>({items.length})</span>
      </h3>
      <ul className="mt-4 grid grid-cols-2 gap-x-8 border-t border-white/[0.09] sm:grid-cols-3">
        {items.map((l) => (
          <li
            key={l.id}
            className={`flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-2.5 text-[15px] ${dim ? "text-white/60" : "text-white/90"}`}
          >
            {l.label}
            <span className="font-mono text-xs text-white/35">{l.extension}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Languages() {
  // Derived from src/lib/languages.ts so this section never drifts from the editor.
  const runnable = languages.filter((l) => l.pistonLang !== "");
  const editOnly = languages.filter((l) => l.pistonLang === "");

  return (
    <section id="languages" aria-labelledby="languages-title" className={sectionClass}>
      <div className={`${shell} grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
        <SectionHeading id="languages-title" title={`Run ${runnable.length} languages online, zero setup`}>
          From Python and JavaScript to C++, Java, Go and Rust: pick a language, press Run and read the output.
        </SectionHeading>

        <div className="space-y-12">
          <LanguageListing title="Run with real output" items={runnable} />
          <div>
            <LanguageListing title="Edit with syntax highlighting" items={editOnly} dim />
            <p className={`mt-4 text-sm ${muted}`}>HTML files also render in a live preview beside your code.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── how it works ─────────────────────────── */

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className={sectionClass}>
      <div className={shell}>
        <SectionHeading id="how-title" title="From blank file to running program in seconds" />
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-primary/70 pt-5">
              <span aria-hidden="true" className="font-display text-4xl font-bold text-primary">
                {i + 1}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
              <p className={`mt-2 max-w-sm text-[15px] leading-relaxed ${muted}`}>{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────── github sync ─────────────────────────── */

function SyncMock() {
  return (
    <div
      role="img"
      aria-label="Illustration of GitHub sync: a project connected to a repository, with recent commits listed and the status shown as in sync"
      className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#0A0C11]"
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[#12141B] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5 font-mono text-sm text-white/85">
            <GitBranch size={16} className="shrink-0 text-primary" />
            <span className="truncate">your-name/hello-python</span>
            <span className="text-white/40">main</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[#3DDC84]">
            <Check size={13} /> In sync
          </span>
        </div>
        <ul className="divide-y divide-white/[0.05] font-mono text-[13px]">
          {[
            ["Update main.py", "main.py", "2m"],
            ["Add helper functions", "utils.py", "14m"],
            ["Fix loop range", "main.py", "1h"],
          ].map(([msg, file, age]) => (
            <li key={msg} className="flex items-center gap-3 px-5 py-3.5">
              <GitCommitHorizontal size={16} className="shrink-0 text-white/30" />
              <span className="min-w-0 flex-1 truncate text-white/80">{msg}</span>
              <span className="hidden shrink-0 text-xs text-white/40 sm:inline">{file}</span>
              <span className="w-8 shrink-0 text-right text-xs text-white/30">{age}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GithubSync() {
  return (
    <section id="github-sync" aria-labelledby="sync-title" className={sectionClass}>
      <div className={`${shell} grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16`}>
        <div>
          <SectionHeading id="sync-title" title="Keep your code in sync with GitHub">
            Your editor and your repository stay in step, so your work lives where the rest of your code does.
          </SectionHeading>
          <dl className="mt-10 space-y-6">
            {GITHUB_SYNC_POINTS.map((p) => (
              <div key={p.title} className="border-l-2 border-white/10 pl-5">
                <dt className="font-semibold text-white">{p.title}</dt>
                <dd className={`mt-1 text-[15px] leading-relaxed ${muted}`}>{p.description}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="lg:pt-2">
          <SyncMock />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── sharing ─────────────────────────── */

function ShareMock() {
  return (
    <div
      role="img"
      aria-label="Illustration of a share link for a code project"
      className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#0A0C11]"
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-white/[0.07] bg-[#12141B] px-4 py-3 font-mono text-sm text-white/75">
          <Link2 size={15} className="shrink-0 text-primary" />
          <span className="truncate">code.zuup.dev/s/your-project</span>
          <span className="ml-auto shrink-0 font-sans text-xs text-white/40">Read only</span>
        </div>
        <div className="overflow-x-auto whitespace-pre p-4 font-mono text-[12.5px] leading-6 text-white/80">
          <div>
            <span className={kw}>def</span> <span className={fn}>greet</span>
            <span className={punct}>(</span>name<span className={punct}>):</span>
          </div>
          <div>
            {"    "}
            <span className={kw}>return</span> <span className={str}>"Hello!"</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sharing() {
  return (
    <section id="sharing" aria-labelledby="sharing-title" className={sectionClass}>
      <div className={`${shell} grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16`}>
        <div>
          <SectionHeading id="sharing-title" title="Share code with one link">
            Send a classmate, a teacher or a friend exactly what you wrote.
          </SectionHeading>
          <ul className="mt-9 space-y-3">
            {SHARING_POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
                <Check size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:pt-2">
          <ShareMock />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── students, teachers and the Zuup mission ─────────────────────────── */

function About() {
  return (
    <section id="about" aria-labelledby="about-title" className={sectionClass}>
      <div className={shell}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <SectionHeading id="about-title" title="Built by youth, for everyone who is learning">
            {SITE_NAME} is part of Zuup&apos;s mission: a free tool to learn and practise coding without expensive
            software, powerful hardware or a credit card.
          </SectionHeading>

          <div>
            <figure>
              <blockquote className="text-balance font-display text-2xl font-semibold leading-snug tracking-[-0.015em] text-white sm:text-[2rem]">
                &ldquo;{MISSION.quote}&rdquo;
              </blockquote>
              <figcaption className={`mt-5 max-w-xl text-[15px] leading-relaxed ${muted}`}>{MISSION.body}</figcaption>
            </figure>

            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-[15px]">
              {MISSION.stats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-2">
                  <dt className={`order-2 ${muted}`}>{s.label.toLowerCase()}</dt>
                  <dd className="order-1 font-display text-2xl font-bold text-white">{s.value}</dd>
                </div>
              ))}
            </dl>

            <p className={`mt-6 max-w-xl text-sm leading-relaxed ${muted}`}>
              Zuup is a youth-led initiative by Zylon Labs, founded by 16-year-old Jagrit Sachdev, dedicated to
              empowering underprivileged youth through digital skill development.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-10 border-t border-white/[0.09] pt-10 md:grid-cols-2">
          {AUDIENCES.map((a) => (
            <div key={a.title}>
              <h3 className="text-lg font-semibold text-white">{a.title}</h3>
              <p className={`mt-2 max-w-md text-[15px] leading-relaxed ${muted}`}>{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── faq ─────────────────────────── */

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={sectionClass}>
      <div className={`${shell} grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
        <SectionHeading id="faq-title" title="Questions about the online code editor" />
        <div className="border-t border-white/[0.09]">
          {FAQS.map((item) => (
            <details key={item.q} className="group border-b border-white/[0.09]">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded py-5 text-left text-white marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="text-base font-medium">{item.q}</span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-white/40 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className={`max-w-[62ch] pb-6 pr-8 text-[15px] leading-relaxed ${muted}`}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── final cta ─────────────────────────── */

function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="border-t border-white/[0.07] py-20 md:py-28">
      <div className={`${shell} flex flex-col gap-8 md:flex-row md:items-end md:justify-between`}>
        <div className="max-w-xl">
          <h2
            id="cta-title"
            className="text-balance font-display text-[2.25rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-white sm:text-5xl"
          >
            Ready to run your first program?
          </h2>
          <p className={`mt-4 text-base leading-relaxed sm:text-lg ${muted}`}>
            Open the editor, write a few lines and press Run. It is free and there is nothing to install.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <Link to="/editor" className={primaryButton}>
            Open the editor
          </Link>
          <Link to="/login" className={secondaryButton}>
            Sign in with Zuup
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── page ─────────────────────────── */

const Landing = () => {
  const { hash, key } = useLocation();

  // React Router does not scroll to #hash targets on navigation, so do it here. This is what makes
  // "/#faq" links from other pages (and the navbar) land on the right section.
  useEffect(() => {
    if (!hash) return;
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep the raw id
    }
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, key]);

  return (
    <SiteLayout padTop={false}>
      <Hero />
      <Features />
      <Languages />
      <HowItWorks />
      <GithubSync />
      <Sharing />
      <About />
      <Faq />
      <FinalCta />
    </SiteLayout>
  );
};

export default Landing;
