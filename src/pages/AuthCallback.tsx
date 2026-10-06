import { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";
import { safeRedirectPath } from "@/lib/safeRedirect";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // AuthProvider is the only place that reads the SSO tokens (see lib/authRedirect); this page
  // just waits for it and routes on.
  const { user, loading, authError, signInWithZuup } = useAuth();
  const redirectTo = safeRedirectPath(searchParams.get("redirect_to"), "/dashboard");
  const noSession = !loading && !user && !authError;
  const errorMsg = authError ?? (noSession ? "We could not find a sign-in to finish. Please sign in again." : null);

  useEffect(() => {
    if (!loading && user && !authError) navigate(redirectTo, { replace: true });
  }, [loading, user, authError, redirectTo, navigate]);

  return (
    <AuthShell
      withChrome={false}
      title={errorMsg ? "Authentication failed" : "Signing you in"}
      subtitle={errorMsg ? undefined : "Verifying your Zuup session and setting up your workspace."}
    >
      {errorMsg ? (
        <div role="alert" className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-white/60">{errorMsg}</p>
          <button
            type="button"
            onClick={() => signInWithZuup(redirectTo)}
            className="focus-ring mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary transition-colors hover:bg-primary/90 px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            Sign in again <ArrowRight size={16} aria-hidden="true" />
          </button>
          <Link to="/" className="focus-ring inline-block rounded-sm text-sm text-white/60 transition-colors hover:text-white">
            Back to Zuup Code
          </Link>
        </div>
      ) : (
        <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-white/60">This only takes a moment...</p>
        </div>
      )}
    </AuthShell>
  );
};

export default AuthCallback;
