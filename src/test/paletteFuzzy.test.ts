import { describe, expect, it } from "vitest";
import { fuzzyMatch, highlightSegments, rankItems } from "@/components/ide/palette/fuzzy";

const labels = (r: { item: { label: string } }[]) => r.map((x) => x.item.label);

describe("fuzzyMatch", () => {
  it("matches characters in order, case-insensitively", () => {
    expect(fuzzyMatch("nf", "New file")).not.toBeNull();
    expect(fuzzyMatch("NEW", "new file")).not.toBeNull();
    expect(fuzzyMatch("fn", "New file")).toBeNull();
    expect(fuzzyMatch("xyz", "New file")).toBeNull();
  });

  it("returns an empty match for an empty query", () => {
    expect(fuzzyMatch("", "Run")).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch("   ", "Run")).toEqual({ score: 0, indices: [] });
  });

  it("ignores whitespace in the query", () => {
    expect(fuzzyMatch("new f", "New file")?.indices).toEqual([0, 1, 2, 4]);
  });

  it("prefers word starts over earlier letters", () => {
    // The second "t" skips the "t"s inside "Toggle" and lands on the start of "terminal".
    const m = fuzzyMatch("tt", "Toggle terminal");
    expect(m?.indices).toEqual([0, 7]);
  });

  it("does not let a word-start jump break the rest of the match", () => {
    // Jumping to the "f" of "files" would leave no "i" for "fi" -> must still match.
    expect(fuzzyMatch("fil", "fixture files")).not.toBeNull();
    expect(fuzzyMatch("abc", "a_bc")).not.toBeNull();
  });

  it("scores prefix and contiguous matches above scattered ones", () => {
    const prefix = fuzzyMatch("run", "Run")!.score;
    const inside = fuzzyMatch("run", "Save before running")!.score;
    const scattered = fuzzyMatch("run", "Reset unsaved notes")!.score;
    expect(prefix).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(scattered);
  });

  it("handles camelCase file names", () => {
    expect(fuzzyMatch("mc", "myClass.java")?.indices).toEqual([0, 2]);
  });
});

describe("rankItems", () => {
  const items = [
    { label: "Toggle sidebar" },
    { label: "Toggle terminal" },
    { label: "Run" },
    { label: "Save before running" },
    { label: "Open settings", keywords: ["preferences", "options"] },
    { label: "New file" },
    { label: "New project" },
  ];

  it("keeps the original order for an empty query", () => {
    expect(labels(rankItems("", items))).toEqual(items.map((i) => i.label));
    expect(labels(rankItems("", items, 2))).toEqual(["Toggle sidebar", "Toggle terminal"]);
  });

  it("ranks the best match first", () => {
    expect(labels(rankItems("run", items))[0]).toBe("Run");
    expect(labels(rankItems("term", items))[0]).toBe("Toggle terminal");
    expect(labels(rankItems("np", items))[0]).toBe("New project");
  });

  it("finds items by keyword without highlighting the label", () => {
    const r = rankItems("prefer", items);
    expect(labels(r)).toEqual(["Open settings"]);
    expect(r[0].indices).toEqual([]);
  });

  it("drops items that do not match and respects the limit", () => {
    expect(rankItems("zzz", items)).toEqual([]);
    expect(rankItems("e", items, 3)).toHaveLength(3);
  });

  it("keeps the original order for ties", () => {
    const tie = [{ label: "a.py" }, { label: "a.js" }];
    expect(labels(rankItems("a", tie))).toEqual(["a.py", "a.js"]);
  });
});

describe("highlightSegments", () => {
  it("groups matched characters into runs", () => {
    expect(highlightSegments("New file", [0, 1, 2, 4])).toEqual([
      { text: "New", match: true },
      { text: " ", match: false },
      { text: "f", match: true },
      { text: "ile", match: false },
    ]);
  });

  it("returns the whole text when nothing matched", () => {
    expect(highlightSegments("Run", [])).toEqual([{ text: "Run", match: false }]);
  });
});
