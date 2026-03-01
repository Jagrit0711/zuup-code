import { Link } from "react-router-dom";
import { ArrowRight, Code2, Play, Share2, Globe, Zap, Shield, FolderOpen, Terminal, Sparkles } from "lucide-react";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-border/40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={LOGO} alt="Zuup" className="h-7 w-7 rounded" />
            <span className="font-bold text-foreground">Zuup</span>
            <span className="font-light text-primary">Code</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Features
            </a>
            <a href="#languages" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Languages
            </a>
            <a href="#about" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              About
            </a>
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Glow effects */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/50 px-4 py-1.5 mb-8">
            <Sparkles size={14} className="text-primary" />
            <span className="text-xs text-muted-foreground">A Zuup Initiative</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Write code.{" "}
            <span className="text-primary">Run it.</span>
            <br />
            <span className="text-muted-foreground">Right here.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            ZuupCode is a free, browser-based IDE with real code execution. 
            30+ languages, instant results, zero setup. Built for students, 
            makers, and anyone who just wants to code.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors glow-primary-sm"
            >
              Start Coding
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/editor"
              className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/50 px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <Play size={14} />
              Try Without Account
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/60 mt-4">
            Setup in seconds · Open source · Powered by Piston
          </p>
        </div>

        {/* Hero preview */}
        <div className="max-w-4xl mx-auto mt-16 relative z-10">
          <div className="rounded-xl border border-border/40 overflow-hidden glow-primary bg-[hsl(230,15%,8%)] shadow-2xl">
            {/* Fake title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-[hsl(230,14%,9%)]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <span className="text-[11px] text-muted-foreground ml-2 font-mono">main.py — ZuupCode</span>
            </div>
            {/* Fake code */}
            <div className="p-6 font-mono text-sm leading-relaxed">
              <div>
                <span className="text-purple-400">def</span>{" "}
                <span className="text-yellow-300">greet</span>
                <span className="text-muted-foreground">(</span>
                <span className="text-orange-300">name</span>
                <span className="text-muted-foreground">):</span>
              </div>
              <div className="ml-8">
                <span className="text-purple-400">return</span>{" "}
                <span className="text-muted-foreground">f</span>
                <span className="text-green-400">"Hello, </span>
                <span className="text-muted-foreground">{"{"}</span>
                <span className="text-orange-300">name</span>
                <span className="text-muted-foreground">{"}"}</span>
                <span className="text-green-400">! Welcome to Zuup 🚀"</span>
              </div>
              <div className="mt-4">
                <span className="text-yellow-300">print</span>
                <span className="text-muted-foreground">(</span>
                <span className="text-yellow-300">greet</span>
                <span className="text-muted-foreground">(</span>
                <span className="text-green-400">"World"</span>
                <span className="text-muted-foreground">))</span>
              </div>
              <div className="mt-4 border-t border-border/30 pt-4">
                <span className="text-success">▶ </span>
                <span className="text-foreground/80">Hello, World! Welcome to Zuup 🚀</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">FEATURES</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything You Need to Code.</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A complete development environment in your browser. No downloads, no configs, no excuses.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Play, title: "Real Execution", desc: "Run Python, JavaScript, Java, C++, and 30+ languages with real output via the Piston engine." },
              { icon: Code2, title: "Monaco Editor", desc: "VS Code's editor engine with syntax highlighting, IntelliSense, and keyboard shortcuts." },
              { icon: FolderOpen, title: "Project Templates", desc: "Start from pre-built templates — Flask, React, Express — or create your own from scratch." },
              { icon: Share2, title: "Instant Sharing", desc: "Share code via a URL. Recipients see your exact code — no signup needed to view." },
              { icon: Terminal, title: "Built-in Terminal", desc: "Output panel with real-time execution results, error highlighting, and clear controls." },
              { icon: Globe, title: "HTML Live Preview", desc: "See HTML/CSS render in real-time in a split pane while you write markup." },
              { icon: Zap, title: "Cloud Save", desc: "Sign in and your projects save automatically. Pick up where you left off, any device." },
              { icon: Shield, title: "Privacy First", desc: "Your code is yours. We don't train on it, sell it, or share it with anyone." },
              { icon: Sparkles, title: "Free Forever", desc: "No paywalls, no premium tiers. Built by Zuup, for students and makers worldwide." },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-xl border border-border/40 bg-card/50 p-6 hover:border-primary/30 hover:bg-card/80 transition-all duration-300"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon size={20} />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Languages ─── */}
      <section id="languages" className="py-24 px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">LANGUAGES</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">30+ Languages. Zero Setup.</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-12">
            From scripting to systems programming — run any language directly in the browser.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "Go", "Rust",
              "Ruby", "PHP", "Swift", "Kotlin", "Scala", "Haskell", "Lua", "Perl",
              "Bash", "R", "Dart", "Elixir", "Clojure", "Nim", "C#", "HTML", "CSS"
            ].map((lang) => (
              <span
                key={lang}
                className="rounded-lg border border-border/40 bg-secondary/50 px-4 py-2 text-sm text-foreground/80 hover:border-primary/40 hover:text-primary transition-colors cursor-default"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── About / Zuup Mission ─── */}
      <section id="about" className="py-24 px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">ABOUT ZUUP</p>
              <h2 className="text-3xl font-bold mb-4">Built by Youth, for Everyone.</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Zuup is a youth-led initiative by Zylon Labs, founded by 16-year-old Jagrit Sachdev, 
                dedicated to empowering underprivileged youth through digital skill development.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-6">
                ZuupCode is one part of that mission — giving anyone, anywhere, a free tool to learn 
                and practice coding without expensive software, powerful hardware, or credit cards.
              </p>
              <div className="flex flex-wrap gap-6 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">500+</div>
                  <div className="text-xs text-muted-foreground">Youth Trained</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">150+</div>
                  <div className="text-xs text-muted-foreground">Freelance Placements</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">10+</div>
                  <div className="text-xs text-muted-foreground">Partner NGOs</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/50 p-8">
              <blockquote className="text-lg italic text-foreground/80 leading-relaxed mb-4">
                "Give a man a fish and you feed him for a day. Teach a man to fish and you feed him for a lifetime."
              </blockquote>
              <p className="text-sm text-muted-foreground">
                We don't believe in charity — we believe in capability. Every tool we build is designed
                to create self-sufficient learners, not dependents.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <img src={LOGO} alt="Zuup" className="h-10 w-10 rounded" />
                <div>
                  <div className="text-sm font-semibold">Zuup</div>
                  <div className="text-xs text-muted-foreground">A Zylon Labs Initiative</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24 px-6 border-t border-border/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Start Coding?</h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Create a free account to save your projects in the cloud, or jump straight into the editor — no sign-up needed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors glow-primary-sm"
            >
              Create Free Account
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/editor"
              className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/50 px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Open Editor
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/30 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={LOGO} alt="Zuup" className="h-7 w-7 rounded" />
            <div>
              <div className="text-sm font-semibold">ZuupCode</div>
              <div className="text-xs text-muted-foreground">A free browser-based IDE. Always free.</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="https://zuup.dev" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
              Zuup Main
            </a>
            <a href="https://time.zuup.dev" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
              ZuupTime
            </a>
            <a href="https://github.com/Jagrit0711" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
              GitHub
            </a>
          </div>
          <div className="text-xs text-muted-foreground">
            © 2026 ZuupCode by <a href="https://github.com/Jagrit0711" className="text-primary hover:underline">Jagrit</a>. Built with ❤️
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
