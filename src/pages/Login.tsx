import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldCheck, Cloud, Zap } from "lucide-react";

const LOGO = "https://www.zuup.dev/lovable-uploads/b44b8051-6117-4b37-999d-014c4c33dd13.png";

const Login = () => {
  const { user, loading, signInWithZuup } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const redirectTarget = searchParams.get("redirect") || "/editor";

  // If already logged in, seamlessly forward to target
  useEffect(() => {
    if (!loading && user) {
      navigate(redirectTarget, { replace: true });
    }
  }, [user, loading, navigate, redirectTarget]);

  const handleZuupLogin = () => {
    setIsRedirecting(true);
    signInWithZuup(redirectTarget);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 relative overflow-hidden">
      {/* Background glow ambiance */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[360px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[90px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo and title */}
        <div className="flex flex-col items-center mb-8 text-center">
          <Link to="/" className="flex items-center gap-2.5 mb-6 group">
            <div className="relative">
              <img
                src={LOGO}
                alt="Zuup"
                className="h-10 w-10 rounded-xl group-hover:scale-105 transition-transform shadow-lg shadow-primary/20"
              />
              <div className="absolute inset-0 bg-primary/20 rounded-xl blur group-hover:blur-md transition-all pointer-events-none" />
            </div>
            <div className="flex items-center text-2xl font-bold tracking-tight">
              <span>Zuup</span>
              <span className="font-light text-primary ml-1">Code</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign In to Zuup Code</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            Authenticate with your unified Zuup Developer Account to access the IDE and cloud storage.
          </p>
        </div>

        {/* Exclusive SSO Card */}
        <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-7 shadow-2xl space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/40 text-xs text-muted-foreground">
              <ShieldCheck size={18} className="text-primary shrink-0" />
              <span>Unified SSO across the Zuup ecosystem</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/40 text-xs text-muted-foreground">
              <Cloud size={18} className="text-primary shrink-0" />
              <span>Automatic cloud backup & project persistence</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/40 text-xs text-muted-foreground">
              <Zap size={18} className="text-primary shrink-0" />
              <span>Instant access to 30+ language compilers</span>
            </div>
          </div>

          {/* Primary Zuup SSO Button */}
          <button
            onClick={handleZuupLogin}
            disabled={isRedirecting || loading}
            className="w-full group relative flex items-center justify-center gap-3 rounded-xl border border-primary/50 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 px-5 py-3.5 text-sm font-semibold text-foreground hover:border-primary hover:from-primary/30 hover:to-primary/30 transition-all shadow-lg shadow-primary/10 active:scale-[0.99] disabled:opacity-60"
          >
            {isRedirecting ? (
              <Loader2 size={18} className="animate-spin text-primary" />
            ) : (
              <img
                src={LOGO}
                alt="Zuup Auth"
                className="h-5 w-5 rounded object-contain group-hover:scale-110 transition-transform"
              />
            )}
            <span className="font-medium">
              {isRedirecting ? "Connecting to Zuup SSO..." : "Continue with Zuup Account"}
            </span>
            <span className="ml-auto text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              SSO
            </span>
          </button>

          <div className="text-center pt-2 border-t border-border/30">
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              Zuup SSO is the exclusive authentication provider for Zuup Code. By continuing, you agree to Zuup's terms of service and developer guidelines.
            </p>
          </div>
        </div>

        {/* Link to landing */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Return to Zuup Code Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
