import { File, FileCode2, FileJson, FileText, FileType, Image as ImageIcon, Table, type LucideIcon } from "lucide-react";

const CODE = new Set([
  "py", "js", "mjs", "cjs", "ts", "jsx", "tsx", "c", "cpp", "cc", "h", "hpp", "java", "go", "rs", "rb", "php",
  "lua", "swift", "kt", "cs", "dart", "r", "sql", "sh", "bash", "pl", "scala", "hs", "clj", "ex", "exs", "nim",
  "html", "htm", "css", "scss", "less", "xml", "vue", "svelte",
]);
const TEXT = new Set(["md", "markdown", "txt", "rst", "log"]);
const DATA = new Set(["json", "yaml", "yml", "toml"]);
const TABLE = new Set(["csv", "tsv"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"]);
const FONT = new Set(["ttf", "otf", "woff", "woff2"]);

/** A single monochrome glyph per broad file kind. Colour comes from the row, never the type. */
export function fileGlyph(fileName: string): LucideIcon {
  const base = fileName.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (CODE.has(ext)) return FileCode2;
  if (DATA.has(ext)) return FileJson;
  if (TEXT.has(ext)) return FileText;
  if (TABLE.has(ext)) return Table;
  if (IMAGE.has(ext)) return ImageIcon;
  if (FONT.has(ext)) return FileType;
  return File;
}
