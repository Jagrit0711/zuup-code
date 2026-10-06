import { SiteLayout } from "@/components/site/SiteLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_HREF, ORG_LEGAL_NAME, PARENT_SITE_URL, SOCIAL } from "@/content/site";

const REASONS = [
  { title: "Something is broken", desc: "A program that will not run, a page that will not load or a link that goes nowhere." },
  { title: "Your account or projects", desc: "Signing in with Zuup, saved projects, share links or GitHub sync." },
  { title: "Schools and teachers", desc: "Using Zuup Code with a class, or bringing Zuup to your school." },
  { title: "Security", desc: "Report a vulnerability privately. Please do not open a public issue for it." },
];

const linkClass = "focus-ring rounded-sm text-white underline decoration-white/30 underline-offset-4 hover:decoration-primary";

const Contact = () => {
  usePageMeta({ title: "Contact" });

  return (
    <SiteLayout>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-14 px-4 pb-24 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:px-8">
        <div>
          <h1 className="text-balance font-display text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl">
            Contact
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[#8B90A0] sm:text-lg">
            Zuup Code is run by {ORG_LEGAL_NAME}. Write to us and a person on the team will read it.
          </p>

          <dl className="mt-10 space-y-5 text-[15px]">
            <div>
              <dt className="text-[#8B90A0]">Email</dt>
              <dd className="mt-1">
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[#8B90A0]">Phone</dt>
              <dd className="mt-1">
                <a href={CONTACT_PHONE_HREF} className={linkClass}>
                  {CONTACT_PHONE}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[#8B90A0]">Elsewhere</dt>
              <dd className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                <a href={PARENT_SITE_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  zuup.dev
                </a>
                <a href={SOCIAL.github} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  GitHub
                </a>
                <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Instagram
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white">What to write about</h2>
          <ul className="mt-4 border-t border-white/[0.09]">
            {REASONS.map((r) => (
              <li key={r.title} className="border-b border-white/[0.09] py-5">
                <h3 className="text-[15px] font-semibold text-white">{r.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-[#8B90A0]">{r.desc}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-[#8B90A0]">
            For a problem with a program, include the language, the code and the output you saw. It makes the fix much faster.
          </p>
        </div>
      </div>
    </SiteLayout>
  );
};

export default Contact;
