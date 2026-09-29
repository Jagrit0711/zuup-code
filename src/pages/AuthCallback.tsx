import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

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
            const redirectTo = searchParams.get("redirect_to") || "/dashboard";
            navigate(redirectTo, { replace: true });
            return;
          }
        } catch (err: any) {
          setErrorMsg(err.message || "Failed to set session");
          return;
        }
      }

      // 4. Check if session already exists
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await refreshProfile();
        const redirectTo = searchParams.get("redirect_to") || "/dashboard";
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
    <div className="min-h-screen flex items-center justify-center bg-background px-6 relative">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md text-center relative z-10">
        <Link to="/" className="inline-flex items-center gap-2.5 mb-8">
          <img src={LOGO} alt="Zuup" className="h-9 w-9 rounded" />
          <span className="text-xl font-bold">Zuup</span>
          <span className="text-xl font-light text-primary">Code</span>
        </Link>

        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl p-8 shadow-2xl">
          {errorMsg ? (
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <h2 className="text-lg font-bold">Authentication Failed</h2>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors w-full mt-4"
              >
                Back to Sign In <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <Loader2 size={32} className="animate-spin text-primary mx-auto" />
              <h2 className="text-lg font-bold">Authenticating with Zuup</h2>
              <p className="text-xs text-muted-foreground">Verifying secure credentials and setting up your workspace...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
