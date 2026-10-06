import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ insert: h.insert }), auth: { getUser: vi.fn() } },
}));

import { syncLocalProjectsToCloud } from "@/lib/projectStorage";

const KEY = "zuup_code_local_projects";
const proj = (id: string, user_id = "guest") => ({
  id, user_id, name: id, description: "", language: "python", files: [], is_public: false, created_at: "", updated_at: "",
});

describe("syncLocalProjectsToCloud", () => {
  beforeEach(() => {
    localStorage.clear();
    h.insert.mockReset().mockImplementation(() => new Promise((r) => setTimeout(() => r({ error: null }), 5)));
  });

  it("migrates each guest project once even if called twice at the same time", async () => {
    localStorage.setItem(KEY, JSON.stringify([proj("local_a"), proj("local_b")]));
    const [a, b] = await Promise.all([syncLocalProjectsToCloud("u1"), syncLocalProjectsToCloud("u1")]);
    expect(h.insert).toHaveBeenCalledTimes(2);
    expect(a).toBe(2);
    expect(b).toBe(2);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it("keeps projects that failed to upload instead of deleting them", async () => {
    localStorage.setItem(KEY, JSON.stringify([proj("local_ok"), proj("local_fail")]));
    h.insert.mockImplementation((row: { name: string }) =>
      Promise.resolve({ error: row.name === "local_fail" ? { message: "offline" } : null })
    );
    expect(await syncLocalProjectsToCloud("u1")).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).map((p: { id: string }) => p.id)).toEqual(["local_fail"]);
  });

  it("leaves another account's offline projects alone", async () => {
    localStorage.setItem(KEY, JSON.stringify([proj("local_mine", "u1"), proj("local_theirs", "u2")]));
    h.insert.mockResolvedValue({ error: null });
    expect(await syncLocalProjectsToCloud("u1")).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).map((p: { id: string }) => p.id)).toEqual(["local_theirs"]);
  });
});
