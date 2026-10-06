import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldCheck, Sparkles, FolderCode, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { usePageMeta } from "@/hooks/usePageMeta";
import { LOGO_URL } from "@/content/site";

const Signup = () => {
  const { user, loading, signInWithZuup } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  usePageMeta({ title: "Sign up", noindex: true });
  const [isRedirecting, setIsRedirecting] = useState(false);

  const redirectTarget = safeRedirectPath(searchParams.get("redirect"));

  useEffect(() => {
    if (!loading && user) {
      navigate(redirectTarget, { replace: true });
    }
  }, [user, loading, navigate, redirectTarget]);

  const handleZuupSignup = () => {
    setIsRedirecting(true);
    signInWithZuup(redirectTarget);
  };

  const perks = [
    { icon: Sparkles, text: "Free to use, with no credit card or setup" },
    { icon: FolderCode, text: "Multi-file projects with auto-save" },
    { icon: ShieldCheck, text: "One Zuup account across all Zuup products" },
  ];

  return (
    <AuthShell
      title="Create your Zuup account"
      subtitle="Start coding with your projects saved to your account and real code execution."
      below={
        <Link to="/" className="focus-ring inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-white">
          &larr; Back to Zuup Code
        </Link>
      }
    >
      <ul className="space-y-2.5">
        {perks.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/60"
          >
            <Icon size={18} aria-hidden="true" className="shrink-0 text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleZuupSignup}
        disabled={isRedirecting || loading}
        className="focus-ring mt-6 flex w-full items-center justify-center gap-3 rounded-md bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isRedirecting ? (
          <Loader2 size={18} aria-hidden="true" className="animate-spin" />
        ) : (
          <img src={LOGO_URL} alt="" width={20} height={20} className="h-5 w-5 rounded object-contain" />
        )}
        <span>{isRedirecting ? "Connecting to Zuup SSO..." : "Sign up with Zuup Account"}</span>
      </button>

      <p className="mt-5 text-center text-xs text-white/50">
        Already have an account?{" "}
        <Link
          to={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
          className="focus-ring inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline"
        >
          Sign in with Zuup SSO <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </p>

      <p className="mt-5 border-t border-white/10 pt-5 text-center text-xs leading-relaxed text-white/60">
        Zuup SSO is the sign-in provider for Zuup Code. Questions about your account?{" "}
        <Link to="/contact" className="focus-ring rounded-sm text-white/80 underline underline-offset-2 hover:text-white">
          Contact us
        </Link>
        .
      </p>
    </AuthShell>
  );
};

export default Signup;
