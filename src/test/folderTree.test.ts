import { describe, it, expect } from "vitest";
import { buildFolderTree, getBreadcrumbSegments, getFileIconInfo } from "@/lib/folderTree";
import { createFile } from "@/lib/fileSystem";

describe("Folder Tree Construction", () => {
  it("should build nested folder nodes from file paths with slashes", () => {
    const files = [
      createFile("package.json", "json", "{}"),
      createFile("src/index.js", "javascript", "console.log('hi');"),
      createFile("src/components/App.jsx", "javascript", "export default function App() {}"),
      createFile("src/components/Button.jsx", "javascript", "export default function Button() {}"),
      createFile("public/favicon.ico", "plaintext", ""),
    ];

    const tree = buildFolderTree(files, ["src", "src/components", "public"]);

    // Root should contain folders first, then files
    const rootNames = tree.map((n) => n.name);
    expect(rootNames).toContain("public");
    expect(rootNames).toContain("src");
    expect(rootNames).toContain("package.json");

    // "src" should be a folder
    const srcNode = tree.find((n) => n.name === "src");
    expect(srcNode).toBeDefined();
    expect(srcNode?.isFolder).toBe(true);

    // "src" children should include "components" folder and "index.js"
    const srcChildrenNames = srcNode?.children?.map((c) => c.name);
    expect(srcChildrenNames).toContain("components");
    expect(srcChildrenNames).toContain("index.js");

    // "components" folder should contain App.jsx and Button.jsx
    const compNode = srcNode?.children?.find((c) => c.name === "components");
    expect(compNode?.isFolder).toBe(true);
    const compChildren = compNode?.children?.map((c) => c.name);
    expect(compChildren).toContain("App.jsx");
    expect(compChildren).toContain("Button.jsx");
  });

  it("should extract breadcrumb segments accurately", () => {
    const segments = getBreadcrumbSegments("src/components/App.jsx", "todo-list-app");
    expect(segments).toHaveLength(4);
    expect(segments[0].label).toBe("todo-list-app");
    expect(segments[0].isRoot).toBe(true);
    expect(segments[1].label).toBe("src");
    expect(segments[1].isFolder).toBe(true);
    expect(segments[2].label).toBe("components");
    expect(segments[2].isFolder).toBe(true);
    expect(segments[3].label).toBe("App.jsx");
    expect(segments[3].isFile).toBe(true);
  });

  it("should return extension-specific badges for React, JS, and Python", () => {
    const reactInfo = getFileIconInfo("App.jsx");
    expect(reactInfo.symbol).toBe("⚛");
    expect(reactInfo.badgeColor).toContain("cyan");

    const jsInfo = getFileIconInfo("index.js");
    expect(jsInfo.symbol).toBe("{ }");

    const pyInfo = getFileIconInfo("main.py");
    expect(pyInfo.symbol).toBe("🐍");
  });
});
