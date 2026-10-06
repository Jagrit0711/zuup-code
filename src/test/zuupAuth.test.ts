import { describe, it, expect, beforeEach, vi } from "vitest";
import { ZUUP_AUTH_GATEWAY_URL, ZUUP_GATEWAY_KEY, supabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/profile";
import { createProject, getProject, getUserProjects, deleteProject } from "@/lib/projectStorage";

describe("Zuup Auth & Supabase Edge Proxy Configuration", () => {
  it("should default to https://auth.zuup.dev gateway URL", () => {
    expect(ZUUP_AUTH_GATEWAY_URL).toBe("https://auth.zuup.dev");
  });

  it("should use the gateway key for anon authorization", () => {
    expect(ZUUP_GATEWAY_KEY).toBeDefined();
    expect(typeof ZUUP_GATEWAY_KEY).toBe("string");
  });

  it("should initialize supabase client targeting the Zuup gateway", () => {
    expect(supabase).toBeDefined();
    expect((supabase as unknown as { supabaseUrl: string }).supabaseUrl).toBe("https://auth.zuup.dev");
  });
});

describe("Profile Management", () => {
  it("should synthesize a profile when given an auth user", async () => {
    // Mock supabase calls in test to avoid network timeouts
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: () => ({
        select: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const mockUser = {
      app_metadata: {},
      aud: "authenticated",
      id: "test-user-uuid-1234",
      email: "developer@zuup.dev",
      user_metadata: {
        full_name: "Zuup Developer",
        preferred_username: "zuupdev",
        avatar_url: "https://zuup.dev/avatar.png",
      },
      created_at: new Date().toISOString(),
    };

    const profile = await ensureProfile(mockUser);
    expect(profile).toBeDefined();
    expect(profile?.id).toBe("test-user-uuid-1234");
    expect(profile?.display_name).toContain("Zuup Developer");
  });
});

describe("Project Storage (Guest & Offline Fallback)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should create and retrieve a project locally when guest", async () => {
    // Mock getUser to simulate guest (no logged in user)
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

    const project = await createProject(
      "Test Project",
      "A test description",
      "python",
      [{ name: "main.py", language: "python", content: "print('Hello Zuup!')" }]
    );

    expect(project).toBeDefined();
    expect(project?.name).toBe("Test Project");
    expect(project?.files).toHaveLength(1);
    expect(project?.files[0].content).toBe("print('Hello Zuup!')");

    // Retrieve single project
    const retrieved = await getProject(project!.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(project!.id);

    // List projects
    const all = await getUserProjects();
    expect(all.some(p => p.id === project!.id)).toBe(true);

    // Delete project
    const deleted = await deleteProject(project!.id);
    expect(deleted).toBe(true);
    const afterDelete = await getProject(project!.id);
    expect(afterDelete).toBeNull();
  });
});

describe("Zuup SSO Redirection Logic", () => {
  it("should construct valid Zuup SSO gateway URLs with target redirect", () => {
    const returnUrl = "/editor";
    const cleanPath = returnUrl.startsWith("/") ? returnUrl : `/${returnUrl}`;
    const destination = `http://localhost:8080/auth/callback?redirect_to=${encodeURIComponent(cleanPath)}`;
    const targetUrl = new URL(`${ZUUP_AUTH_GATEWAY_URL}/login`);
    targetUrl.searchParams.set("redirect_to", destination);

    expect(targetUrl.origin).toBe("https://auth.zuup.dev");
    expect(targetUrl.pathname).toBe("/login");
    expect(targetUrl.searchParams.get("redirect_to")).toContain("/auth/callback?redirect_to=%2Feditor");
  });
});

