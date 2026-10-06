import { useEffect, useId, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { updateProfile, type Profile } from "@/lib/profile";

interface AccountSectionProps {
  user: User | null;
  profile: Profile | null;
  displayName: string;
  avatarUrl: string | null;
  projectCount: number;
  fileCount: number;
  exporting: boolean;
  onExport: () => void;
  onSignOut: () => void;
  refreshProfile: () => Promise<void>;
}

const secondaryButton =
  "inline-flex h-8 items-center rounded-md border border-rule bg-transparent px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none";

const inputClass =
  "h-8 w-full rounded-md border border-rule bg-ink px-2.5 text-[13px] text-foreground placeholder:text-faint focus-visible:border-primary/60 focus-visible:outline-none";

function Row({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-rule py-6 md:grid-cols-[16rem_1fr] md:gap-10">
      <div>
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] text-muted-foreground">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

export function AccountSection({
  user,
  profile,
  displayName,
  avatarUrl,
  projectCount,
  fileCount,
  exporting,
  onExport,
  onSignOut,
  refreshProfile,
}: AccountSectionProps) {
  const initial = {
    display_name: profile?.display_name || "",
    username: profile?.username || "",
    avatar_url: profile?.avatar_url || "",
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      display_name: profile?.display_name || "",
      username: profile?.username || "",
      avatar_url: profile?.avatar_url || "",
    });
  }, [profile?.display_name, profile?.username, profile?.avatar_url]);

  const dirty =
    form.display_name !== initial.display_name ||
    form.username !== initial.username ||
    form.avatar_url !== initial.avatar_url;

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const result = await updateProfile(user.id, {
      display_name: form.display_name.trim() || null,
      username: form.username.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    });
    if (result.success) {
      toast.success("Profile saved");
      await refreshProfile();
    } else {
      toast.error(`Could not save your profile. ${result.error ?? "Try again in a moment."}`);
    }
    setSaving(false);
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section id="account" aria-labelledby="account-title" className="mt-20 scroll-mt-20">
      <h2 id="account-title" className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
        Account
      </h2>
      <p className="mt-1 text-[14px] text-muted-foreground">
        Signed in as <span className="text-foreground">{user?.email ?? displayName}</span>
        {memberSince && <>, member since {memberSince}</>}
      </p>

      <div className="mt-6">
        <Row title="Profile" description="Your name and picture appear on projects you share.">
          <form
            className="grid max-w-xl gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-raised text-[13px] font-semibold text-muted-foreground"
                >
                  {initials || "?"}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-foreground">{displayName}</p>
                {profile?.username && <p className="truncate text-[12px] text-muted-foreground">@{profile.username}</p>}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name">
                {(id) => (
                  <input
                    id={id}
                    className={inputClass}
                    value={form.display_name}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  />
                )}
              </Field>
              <Field label="Username">
                {(id) => (
                  <input
                    id={id}
                    className={inputClass}
                    value={form.username}
                    placeholder="ada"
                    autoComplete="username"
                    spellCheck={false}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  />
                )}
              </Field>
            </div>
            <Field label="Picture URL" hint="A link to a square image, such as your GitHub avatar.">
              {(id) => (
                <input
                  id={id}
                  type="url"
                  className={inputClass}
                  value={form.avatar_url}
                  placeholder="https://"
                  spellCheck={false}
                  onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                />
              )}
            </Field>
            <div className="flex items-center gap-2">
              <button type="submit" className={secondaryButton} disabled={!dirty || saving}>
                {saving ? "Saving" : "Save profile"}
              </button>
              {dirty && !saving && (
                <button
                  type="button"
                  onClick={() => setForm(initial)}
                  className="h-8 rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary motion-reduce:transition-none"
                >
                  Discard changes
                </button>
              )}
            </div>
          </form>
        </Row>

        <Row
          title="Your data"
          description="Download a copy of every project and its files as a single JSON file you can keep."
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className={secondaryButton} onClick={onExport} disabled={exporting || projectCount === 0}>
              {exporting ? "Exporting" : "Export all projects"}
            </button>
            <span className="text-[13px] text-muted-foreground">
              {projectCount === 1 ? "1 project" : `${projectCount} projects`},{" "}
              {fileCount === 1 ? "1 file" : `${fileCount} files`}
            </span>
          </div>
        </Row>

        <Row title="Sign out" description="Sign out of Zuup Code on this device. Your projects stay saved.">
          <button type="button" className={secondaryButton} onClick={onSignOut}>
            Sign out
          </button>
        </Row>
      </div>
    </section>
  );
}
