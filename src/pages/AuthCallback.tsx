import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";
import { safeRedirectPath } from "@/lib/safeRedirect";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshProfile } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleAuth = async () => {
      // 1. Check for errors returned in query params
      const errorParam = searchParams.get("error");
      const errorDesc = searchParams.get("error_description");
      if (errorParam || errorDesc) {
        setErrorMsg(errorDesc || errorParam || "Authentication failed");
        return;
      }

      // 2. Check token in query param
      const token = searchParams.get("token");

      // 3. Check hash for access_token & refresh_token
      const hash = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token") || token;
      const refreshToken = hashParams.get("refresh_token") || accessToken;

      if (accessToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || accessToken,
          });

          if (error) {
            setErrorMsg(error.message);
            return;
          }

          if (data.session) {
            await refreshProfile();
            const redirectTo = safeRedirectPath(searchParams.get("redirect_to"), "/dashboard");
            navigate(redirectTo, { replace: true });
            return;
          }
        } catch (err) {
          setErrorMsg(err instanceof Error && err.message ? err.message : "Failed to set session");
          return;
        }
      }

      // 4. Check if session already exists
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await refreshProfile();
        const redirectTo = safeRedirectPath(searchParams.get("redirect_to"), "/dashboard");
        navigate(redirectTo, { replace: true });
      } else {
        // No session found and no tokens passed
        setTimeout(() => {
          navigate("/login", { replace: true });
        }, 1500);
      }
    };

    handleAuth();
  }, [searchParams, navigate, refreshProfile]);

  return (
    <AuthShell
      withChrome={false}
      title={errorMsg ? "Authentication failed" : "Signing you in"}
      subtitle={errorMsg ? undefined : "Verifying your Zuup session and setting up your workspace."}
    >
      {errorMsg ? (
        <div role="alert" className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle size={24} aria-hidden="true" />
          </div>
          <p className="text-sm leading-relaxed text-white/60">{errorMsg}</p>
          <Link
            to="/login"
            className="focus-ring mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary transition-colors hover:bg-primary/90 px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            Back to Sign In <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
          <Loader2 size={32} aria-hidden="true" className="animate-spin text-primary motion-reduce:animate-none" />
          <p className="text-sm text-white/60">This only takes a moment...</p>
        </div>
      )}
    </AuthShell>
  );
};

export default AuthCallback;
