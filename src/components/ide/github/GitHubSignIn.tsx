import { useEffect, useId, useState } from "react";
import { ExternalLink, Github, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type OAuthScope, detectOAuthConfigured, signInWithToken, startOAuth } from "@/lib/github";
import { inputClass, primaryButtonClass } from "./styles";

const PAT_URL = "https://github.com/settings/personal-access-tokens/new";

/** OAuth when the deployment has an OAuth App, otherwise (or on request) a personal access token form. */
const GitHubSignIn = () => {
  const uid = useId();
  const [oauthAvailable, setOauthAvailable] = useState<boolean | null>(null);
  const [usePat, setUsePat] = useState(false);
  const [scope, setScope] = useState<OAuthScope>("public_repo");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void detectOAuthConfigured().then((ok) => alive && setOauthAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await signInWithToken(token);
      setToken("");
      toast.success(`Signed in to GitHub${auth.login ? ` as @${auth.login}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That token was not accepted.");
    } finally {
      setBusy(false);
    }
  };

  if (oauthAvailable === null) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 size={13} className="animate-spin" /> Checking sign-in options…
      </div>
    );
  }

  if (oauthAvailable && !usePat) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Zuup Code commits to GitHub as you. Choose what it may access:
        </p>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as OAuthScope)} className="gap-2">
          <label htmlFor={`${uid}-public`} className="flex cursor-pointer items-start gap-2 rounded border border-border/60 p-2.5 hover:bg-secondary/30">
            <RadioGroupItem id={`${uid}-public`} value="public_repo" className="mt-0.5" />
            <span>
              <span className="block text-xs font-medium text-foreground">Public repositories</span>
              <span className="block text-[11px] text-muted-foreground">Read and write your public repos (public_repo).</span>
            </span>
          </label>
          <label htmlFor={`${uid}-repo`} className="flex cursor-pointer items-start gap-2 rounded border border-border/60 p-2.5 hover:bg-secondary/30">
            <RadioGroupItem id={`${uid}-repo`} value="repo" className="mt-0.5" />
            <span>
              <span className="block text-xs font-medium text-foreground">Public and private repositories</span>
              <span className="block text-[11px] text-muted-foreground">Needed to sync private repos (repo).</span>
            </span>
          </label>
        </RadioGroup>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setUsePat(true)} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Use an access token instead
          </button>
          <button type="button" onClick={() => startOAuth({ scope })} className={primaryButtonClass}>
            <Github size={13} /> Continue with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitToken} className="space-y-3">
      <div className="space-y-1.5 text-[11px] leading-snug text-muted-foreground">
        <p>
          Paste a GitHub personal access token. A{" "}
          <a href={PAT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
            fine-grained token <ExternalLink size={10} />
          </a>{" "}
          limited to the repositories you want, with <span className="font-medium text-foreground">Contents: Read and write</span>, is the safest choice.
          To create new repositories from here, also grant <span className="font-medium text-foreground">Administration: Read and write</span> (or use a classic token with the <code>repo</code> scope).
        </p>
        <p>The token is stored only in this browser and sent only to GitHub.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${uid}-token`} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <KeyRound size={12} /> Access token
        </label>
        <input
          id={`${uid}-token`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…"
          className={inputClass}
        />
        {error && (
          <p className="text-[11px] text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        {oauthAvailable ? (
          <button type="button" onClick={() => setUsePat(false)} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Sign in with GitHub instead
          </button>
        ) : (
          <span />
        )}
        <button type="submit" disabled={!token.trim() || busy} className={primaryButtonClass}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Sign in
        </button>
      </div>
    </form>
  );
};

export default GitHubSignIn;
