import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type OAuthScope, detectOAuthConfigured, signInWithToken, startOAuth } from "@/lib/github";
import { inputClass, linkButtonClass, primaryButtonClass } from "./styles";

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
      <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
        <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> Checking sign-in options…
      </div>
    );
  }

  if (oauthAvailable && !usePat) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Choose which repositories Zuup Code may read and write.
        </p>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as OAuthScope)} className="gap-2">
          <label htmlFor={`${uid}-public`} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-ink">
            <RadioGroupItem id={`${uid}-public`} value="public_repo" className="mt-0.5" />
            <span>
              <span className="block text-[13px] font-medium text-foreground">Public repositories</span>
              <span className="block text-[12px] text-muted-foreground">Read and write your public repositories. Scope <span className="font-mono text-[11px]">public_repo</span>.</span>
            </span>
          </label>
          <label htmlFor={`${uid}-repo`} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-ink">
            <RadioGroupItem id={`${uid}-repo`} value="repo" className="mt-0.5" />
            <span>
              <span className="block text-[13px] font-medium text-foreground">Public and private repositories</span>
              <span className="block text-[12px] text-muted-foreground">Needed to sync private repositories. Scope <span className="font-mono text-[11px]">repo</span>.</span>
            </span>
          </label>
        </RadioGroup>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setUsePat(true)} className={linkButtonClass}>
            Use an access token instead
          </button>
          <button type="button" onClick={() => startOAuth({ scope })} className={primaryButtonClass}>
            Continue with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitToken} className="space-y-3">
      <div className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
        <p>
          Paste a GitHub personal access token. A{" "}
          <a href={PAT_URL} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2 hover:text-primary">
            fine-grained token
          </a>{" "}
          limited to the repositories you want, with <span className="font-medium text-foreground">Contents: Read and write</span>, is the safest choice.
          To create new repositories from here, also grant <span className="font-medium text-foreground">Administration: Read and write</span> (or use a classic token with the <code className="font-mono text-[12px]">repo</code> scope).
        </p>
        <p>The token is stored only in this browser and sent only to GitHub.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${uid}-token`} className="text-[13px] font-medium text-foreground">
          Access token
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
          <p className="text-[12px] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        {oauthAvailable ? (
          <button type="button" onClick={() => setUsePat(false)} className={linkButtonClass}>
            Sign in with GitHub instead
          </button>
        ) : (
          <span />
        )}
        <button type="submit" disabled={!token.trim() || busy} className={primaryButtonClass}>
          {busy && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />} Sign in
        </button>
      </div>
    </form>
  );
};

export default GitHubSignIn;
