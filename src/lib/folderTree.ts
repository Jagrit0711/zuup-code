import { FileTab } from "./fileSystem";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children?: TreeNode[];
  file?: FileTab;
}

export interface BreadcrumbSegment {
  label: string;
  path: string;
  isFolder: boolean;
  isFile: boolean;
  isRoot?: boolean;
}

/**
 * Builds a hierarchical tree from a list of files and registered folders.
 */
export function buildFolderTree(files: FileTab[], folders: string[] = []): TreeNode[] {
  // Collect all known folder paths (both explicitly registered and extracted from file paths)
  const allFolderPaths = new Set<string>(folders);
  files.forEach((f) => {
    const parts = f.name.split("/").filter(Boolean);
    if (parts.length > 1) {
      let currentPath = "";
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        allFolderPaths.add(currentPath);
      }
    }
  });

  // Root level containers
  const rootNodes: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  // Sort folders by depth so parents are created before children
  const sortedFolders = Array.from(allFolderPaths).sort((a, b) => {
    const depthA = a.split("/").length;
    const depthB = b.split("/").length;
    return depthA - depthB || a.localeCompare(b);
  });

  // Create folder nodes
  sortedFolders.forEach((folderPath) => {
    const parts = folderPath.split("/").filter(Boolean);
    const name = parts[parts.length - 1];
    const node: TreeNode = {
      id: `folder_${folderPath}`,
      name,
      path: folderPath,
      isFolder: true,
      children: [],
    };
    folderMap.set(folderPath, node);

    if (parts.length === 1) {
      rootNodes.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parentNode = folderMap.get(parentPath);
      if (parentNode && parentNode.children) {
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }
  });

  // Insert files into their respective folder nodes or root
  files.forEach((file) => {
    const parts = file.name.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    const fileNode: TreeNode = {
      id: file.id,
      name: fileName,
      path: file.name,
      isFolder: false,
      file,
    };

    if (parts.length === 1) {
      rootNodes.push(fileNode);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parentNode = folderMap.get(parentPath);
      if (parentNode && parentNode.children) {
        parentNode.children.push(fileNode);
      } else {
        rootNodes.push(fileNode);
      }
    }
  });

  // Sort helper: folders first (alphabetical), then files (alphabetical)
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    nodes.forEach((n) => {
      if (n.children && n.children.length > 0) {
        sortNodes(n.children);
      }
    });
  };

  sortNodes(rootNodes);
  return rootNodes;
}

/**
 * Returns breadcrumb segments for the active file path.
 */
export function getBreadcrumbSegments(
  filePath: string,
  projectName: string = "zuup-project"
): BreadcrumbSegment[] {
  if (!filePath) {
    return [{ label: projectName, path: "", isFolder: true, isFile: false, isRoot: true }];
  }

  const parts = filePath.split("/").filter(Boolean);
  const segments: BreadcrumbSegment[] = [
    { label: projectName, path: "", isFolder: true, isFile: false, isRoot: true },
  ];

  let currentPath = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const isFile = i === parts.length - 1;
    segments.push({
      label: part,
      path: currentPath,
      isFolder: !isFile,
      isFile,
    });
  }

  return segments;
}

/**
 * Determines file icon badge metadata based on extension.
 */
export function getFileIconInfo(fileName: string): {
  iconType: string;
  badgeColor: string;
  symbol?: string;
} {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "jsx":
    case "tsx":
      return { iconType: "react", badgeColor: "text-cyan-400", symbol: "⚛" };
    case "js":
      return { iconType: "javascript", badgeColor: "text-amber-400", symbol: "{ }" };
    case "ts":
      return { iconType: "typescript", badgeColor: "text-blue-400", symbol: "TS" };
    case "json":
      return { iconType: "json", badgeColor: "text-yellow-400", symbol: "{ }" };
    case "py":
      return { iconType: "python", badgeColor: "text-emerald-400", symbol: "🐍" };
    case "html":
      return { iconType: "html", badgeColor: "text-orange-400", symbol: "< >" };
    case "css":
    case "scss":
    case "less":
      return { iconType: "css", badgeColor: "text-sky-400", symbol: "#" };
    case "c":
    case "cpp":
    case "h":
    case "hpp":
      return { iconType: "cpp", badgeColor: "text-indigo-400", symbol: "C++" };
    case "java":
      return { iconType: "java", badgeColor: "text-amber-500", symbol: "☕" };
    case "rs":
      return { iconType: "rust", badgeColor: "text-orange-500", symbol: "⚙" };
    case "go":
      return { iconType: "go", badgeColor: "text-cyan-300", symbol: "Go" };
    case "md":
    case "markdown":
      return { iconType: "markdown", badgeColor: "text-slate-300", symbol: "M↓" };
    case "sql":
      return { iconType: "sql", badgeColor: "text-purple-400", symbol: "DB" };
    case "sh":
    case "bash":
    case "zsh":
      return { iconType: "shell", badgeColor: "text-emerald-300", symbol: ">_" };
    default:
      return { iconType: "file", badgeColor: "text-muted-foreground", symbol: "📄" };
  }
}
