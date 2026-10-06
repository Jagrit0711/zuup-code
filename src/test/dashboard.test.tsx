import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SavedProject } from "@/lib/projectStorage";
import {
  copyName,
  DEFAULT_SORT,
  filterProjects,
  formatRelativeTime,
  languageLabel,
  nextSort,
  primaryLanguage,
  sortProjects,
} from "@/components/dashboard/projectList";
import { ProjectTable } from "@/components/dashboard/ProjectTable";

function project(id: string, name: string, updated: string, extra: Partial<SavedProject> = {}): SavedProject {
  return {
    id,
    user_id: "u",
    name,
    description: "",
    language: "python",
    files: [],
    is_public: false,
    created_at: updated,
    updated_at: updated,
    ...extra,
  };
}

const a = project("a", "alpha", "2026-10-01T10:00:00Z");
const b = project("b", "Beta 10", "2026-10-05T10:00:00Z", {
  language: "javascript",
  files: [{ name: "game.js", language: "javascript", content: "" }],
});
const c = project("c", "beta 2", "2026-09-01T10:00:00Z", { description: "Homework for unit 4" });

describe("sortProjects", () => {
  it("sorts by last edited, newest first by default", () => {
    expect(sortProjects([a, b, c], DEFAULT_SORT).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts names case-insensitively with natural numbers", () => {
    const asc = sortProjects([b, c, a], { key: "name", direction: "asc" });
    expect(asc.map((p) => p.name)).toEqual(["alpha", "beta 2", "Beta 10"]);
    const desc = sortProjects([b, c, a], { key: "name", direction: "desc" });
    expect(desc.map((p) => p.name)).toEqual(["Beta 10", "beta 2", "alpha"]);
  });

  it("does not mutate its input and puts invalid dates last", () => {
    const broken = project("z", "zeta", "not a date");
    const input = [broken, a];
    const out = sortProjects(input, DEFAULT_SORT);
    expect(out.map((p) => p.id)).toEqual(["a", "z"]);
    expect(input[0]).toBe(broken);
  });
});

describe("nextSort", () => {
  it("flips the active column and starts others at their natural direction", () => {
    expect(nextSort(DEFAULT_SORT, "edited")).toEqual({ key: "edited", direction: "asc" });
    expect(nextSort(DEFAULT_SORT, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSort({ key: "name", direction: "asc" }, "edited")).toEqual({ key: "edited", direction: "desc" });
  });
});

describe("filterProjects", () => {
  it("returns everything for an empty query", () => {
    expect(filterProjects([a, b], "  ")).toHaveLength(2);
  });

  it("matches name, language label and description", () => {
    expect(filterProjects([a, b, c], "ALPHA").map((m) => m.project.id)).toEqual(["a"]);
    expect(filterProjects([a, b, c], "javascript").map((m) => m.project.id)).toEqual(["b"]);
    expect(filterProjects([a, b, c], "homework").map((m) => m.project.id)).toEqual(["c"]);
  });

  it("matches file names and reports which file matched", () => {
    expect(filterProjects([a, b, c], "game.js")).toEqual([{ project: b, matchedFile: "game.js" }]);
  });

  it("requires every term to match", () => {
    expect(filterProjects([a, b, c], "beta homework").map((m) => m.project.id)).toEqual(["c"]);
    expect(filterProjects([a, b, c], "beta nothing")).toEqual([]);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 9, 6, 15, 0, 0); // 6 Oct 2026, 15:00 local

  it("covers the short ranges", () => {
    expect(formatRelativeTime(new Date(2026, 9, 6, 14, 59, 40), now)).toBe("Just now");
    expect(formatRelativeTime(new Date(2026, 9, 6, 15, 0, 30), now)).toBe("Just now");
    expect(formatRelativeTime(new Date(2026, 9, 6, 14, 59, 0), now)).toBe("1 minute ago");
    expect(formatRelativeTime(new Date(2026, 9, 6, 14, 15, 0), now)).toBe("45 minutes ago");
    expect(formatRelativeTime(new Date(2026, 9, 6, 13, 0, 0), now)).toBe("2 hours ago");
  });

  it("uses calendar days beyond today", () => {
    expect(formatRelativeTime(new Date(2026, 9, 5, 23, 30), now)).toBe("Yesterday");
    expect(formatRelativeTime(new Date(2026, 9, 3, 9, 0), now)).toBe("3 days ago");
  });

  it("falls back to a date, adding the year when it differs", () => {
    expect(formatRelativeTime(new Date(2026, 6, 28), now)).toBe("28 Jul");
    expect(formatRelativeTime(new Date(2025, 8, 1), now)).toMatch(/^1 Sept? 2025$/);
    expect(formatRelativeTime("garbage", now)).toBe("Unknown");
  });
});

describe("small helpers", () => {
  it("names copies without colliding", () => {
    expect(copyName("Snake", [])).toBe("Snake copy");
    expect(copyName("Snake", ["Snake copy"])).toBe("Snake copy 2");
    expect(copyName("Snake copy", ["snake COPY", "Snake copy 2"])).toBe("Snake copy 3");
  });

  it("picks the most common language", () => {
    expect(primaryLanguage([{ language: "c" }, { language: "python" }, { language: "python" }])).toBe("python");
    expect(primaryLanguage([])).toBe("python");
  });

  it("labels known and unknown languages", () => {
    expect(languageLabel("python")).toBe("Python");
    expect(languageLabel("klingon")).toBe("klingon");
  });
});

describe("ProjectTable keyboard", () => {
  const rows = [a, b, c].map((project) => ({ project }));

  function setup() {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const onSort = vi.fn();
    const onExitTop = vi.fn();
    render(
      <MemoryRouter>
        <ProjectTable
          rows={rows}
          sort={DEFAULT_SORT}
          onSort={onSort}
          onOpen={onOpen}
          onRename={vi.fn(async () => true)}
          onDuplicate={vi.fn()}
          onDelete={onDelete}
          onExitTop={onExitTop}
        />
      </MemoryRouter>,
    );
    const trs = screen.getAllByRole("row").slice(1); // skip header row
    return { trs, onOpen, onDelete, onSort, onExitTop };
  }

  it("uses a single tab stop and moves with arrow keys", () => {
    const { trs, onOpen, onExitTop } = setup();
    expect(trs.map((tr) => tr.tabIndex)).toEqual([0, -1, -1]);
    trs[0].focus();
    fireEvent.keyDown(trs[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(trs[1]);
    fireEvent.keyDown(trs[1], { key: "End" });
    expect(document.activeElement).toBe(trs[2]);
    fireEvent.keyDown(trs[2], { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(c, false);
    fireEvent.keyDown(trs[2], { key: "Home" });
    fireEvent.keyDown(trs[0], { key: "ArrowUp" });
    expect(onExitTop).toHaveBeenCalled();
  });

  it("deletes with the Delete key and sorts from the header", () => {
    const { trs, onDelete, onSort } = setup();
    fireEvent.keyDown(trs[1], { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith(b);
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("renames inline with F2", async () => {
    const onRename = vi.fn(async () => true);
    render(
      <MemoryRouter>
        <ProjectTable
          rows={rows}
          sort={DEFAULT_SORT}
          onSort={vi.fn()}
          onOpen={vi.fn()}
          onRename={onRename}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );
    const tr = screen.getAllByRole("row")[1];
    fireEvent.keyDown(tr, { key: "F2" });
    const input = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "  Renamed  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(onRename).toHaveBeenCalledWith(a, "Renamed"));
  });
});
