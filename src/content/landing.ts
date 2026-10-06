// Copy and data for the landing page. Pure data (no React, no browser APIs) so the SEO / prerender
// step can import FAQS at build time and emit FAQPage JSON-LD from the exact same source as the
// visible accordion. FAQ answers are plain text on purpose (they are reused verbatim in JSON-LD).

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: "What is Zuup Code?",
    a: "Zuup Code is a free online code editor and compiler that runs in your browser. You write code in a VS Code style editor, press Run and see the real output. There is nothing to install and no compiler or interpreter to set up on your own computer.",
  },
  {
    q: "Which programming languages can I run online?",
    a: "You can run Python, JavaScript, TypeScript, Java, C, C++, Go and Rust, and the list on this page always shows exactly what is supported today. HTML renders in a live preview, and CSS, Markdown, JSON, CSV and plain text files get syntax highlighting.",
  },
  {
    q: "Is Zuup Code really free?",
    a: "Yes. Zuup Code is free to use, with no paywall and no credit card. It is built by Zuup, a youth-led non-profit initiative, so that students and makers have a free place to learn and practise programming.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Zuup Code runs in your web browser, and your programs are executed on a remote sandboxed server, so you do not need a compiler, an interpreter or an IDE installed. Any modern desktop or laptop browser works.",
  },
  {
    q: "How does the online compiler run my code?",
    a: "When you press Run, your code is sent to a sandboxed code execution service called Piston. It compiles or interprets the program and sends the output and any errors back to the terminal panel in the editor. Programs that read input, such as input() in Python, scanf in C or cin in C++, get an input prompt. Time and memory limits apply to every run.",
  },
  {
    q: "Do I need an account to use Zuup Code?",
    a: "Zuup Code uses a free Zuup account with single sign-on, so your projects are saved and available on any device. Code that someone shares with you as a link can be read without signing in.",
  },
  {
    q: "Can I share my code with someone else?",
    a: "Yes. Create a share link from the editor and send it to anyone. They can read your code in their browser without an account. Your projects are not public unless you choose to share them.",
  },
  {
    q: "Can I sync my projects with GitHub?",
    a: "GitHub sync lets you connect a project to a repository so that your changes are committed while you work and changes made elsewhere can be pulled into the editor. If the same file was changed in both places, Zuup Code asks you before anything is overwritten.",
  },
  {
    q: "Is my code private?",
    a: "Your projects belong to your account and are not public unless you share a link. When you run a program, the code is sent to the execution service only to produce the output. If you have a question about your data, use the Contact page.",
  },
  {
    q: "Can I use Zuup Code for school or for learning to code?",
    a: "Yes, that is what it was made for. Students and teachers can write and run code on any computer with a browser, including shared or school machines where installing software is not possible. Teachers can share an example as a link and students can open it straight away.",
  },
];

export const HERO_CHIPS = [
  "Free to use",
  "Nothing to install",
  "Real code execution",
  "Built by a youth-led non-profit",
] as const;

export type FeatureIcon = "play" | "code" | "folders" | "globe" | "cloud" | "keyboard" | "lock" | "heart";

export interface Feature {
  id: string;
  icon: FeatureIcon;
  title: string;
  description: string;
  /** Wide features span both columns of the feature list and show an example beside the text. */
  wide?: boolean;
}

export const FEATURES: Feature[] = [
  {
    id: "execution",
    icon: "play",
    title: "Real code execution",
    description:
      "Run your program and get real output and real error messages, not a simulation. Programs that ask for input get an input prompt in the terminal panel.",
    wide: true,
  },
  {
    id: "monaco",
    icon: "code",
    title: "A VS Code style editor",
    description: "Built on Monaco, the editor engine behind VS Code: syntax highlighting, code completion, multi-cursor editing and find and replace.",
  },
  {
    id: "projects",
    icon: "folders",
    title: "Multi-file projects",
    description: "Organise work into folders and files with tabs and a file tree, and let auto-save keep your changes.",
  },
  {
    id: "preview",
    icon: "globe",
    title: "HTML live preview",
    description: "Write HTML and CSS and see the page render beside your code.",
  },
  {
    id: "cloud",
    icon: "cloud",
    title: "Saved to your account",
    description: "Sign in with your Zuup account and your projects are there on every device you use.",
  },
  {
    id: "shortcuts",
    icon: "keyboard",
    title: "Keyboard first",
    description: "Run with Ctrl+Enter, save with Ctrl+S and open the shortcut list with Ctrl+/.",
  },
  {
    id: "private",
    icon: "lock",
    title: "Yours until you share it",
    description: "Your projects stay in your account. Nothing becomes public unless you send someone a link.",
  },
  {
    id: "free",
    icon: "heart",
    title: "Free for learners",
    description: "No paywall and no credit card. Zuup Code is made so that anyone can practise programming.",
  },
];

export const STEPS = [
  {
    title: "Open the editor",
    description: "Sign in with your free Zuup account and start with an empty file. There is nothing to download or configure.",
  },
  {
    title: "Write your code",
    description: "Pick a language or name your file with an extension such as main.py or app.cpp, then start typing.",
  },
  {
    title: "Run, save and share",
    description: "Press Ctrl+Enter to run it and read the output. Your project is saved to your account, and a share link sends it to anyone.",
  },
] as const;

export const GITHUB_SYNC_POINTS = [
  {
    title: "Commits while you work",
    description: "Connect a project to a GitHub repository and your edits are committed to it as you go.",
  },
  {
    title: "Pull changes from the repository",
    description: "Edited a file on GitHub or on another machine? Pull the change into the editor.",
  },
  {
    title: "Nothing is overwritten silently",
    description: "If the same file changed in both places, Zuup Code stops and asks you instead of choosing for you.",
  },
] as const;

export const SHARING_POINTS = [
  "Create a link from the editor in a few clicks.",
  "Anyone with the link can read your code in their browser, with no account needed.",
  "Your project stays yours: nothing is shared unless you send the link.",
] as const;

export const AUDIENCES = [
  {
    title: "For students",
    description: "Practise on any computer, including shared and school machines where you cannot install a compiler.",
  },
  {
    title: "For teachers",
    description: "Share an example as a link and have a whole class open and run it in the browser, with no setup.",
  },
] as const;

// Zuup mission claims (kept from the previous landing page).
export const MISSION = {
  quote: "Give a man a fish and you feed him for a day. Teach a man to fish and you feed him for a lifetime.",
  body: "We don't believe in charity, we believe in capability. Every tool we build is designed to create self-sufficient learners, not dependents.",
  stats: [
    { value: "500+", label: "Youth trained" },
    { value: "150+", label: "Freelance placements" },
    { value: "10+", label: "Partner NGOs" },
  ],
} as const;
