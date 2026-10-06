import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
import type { SavedProject } from "@/lib/projectStorage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  formatFullDate,
  formatRelativeTime,
  languageExtension,
  languageLabel,
  type ProjectMatch,
  type SortKey,
  type SortState,
} from "./projectList";

export interface ProjectTableHandle {
  /** Moves keyboard focus to the first row (used by ArrowDown from the search field). */
  focusFirstRow: () => void;
}

interface ProjectTableProps {
  rows: ProjectMatch<SavedProject>[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onOpen: (project: SavedProject, newTab: boolean) => void;
  onRename: (project: SavedProject, name: string) => Promise<boolean>;
  onDuplicate: (project: SavedProject) => void;
  onDelete: (project: SavedProject) => void;
  /** Called when ArrowUp is pressed on the first row. */
  onExitTop?: () => void;
  busyId?: string | null;
}

const menuItemClass =
  "rounded-md px-2 py-1.5 text-[13px] text-foreground focus:bg-ink focus:text-foreground cursor-pointer";

export const ProjectTable = forwardRef<ProjectTableHandle, ProjectTableProps>(function ProjectTable(
  { rows, sort, onSort, onOpen, onRename, onDuplicate, onDelete, onExitTop, busyId },
  ref,
) {
  const [activeId, setActiveId] = useState<string | null>(rows[0]?.project.id ?? null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const now = new Date();

  // Keep the roving tab stop on a row that still exists.
  useEffect(() => {
    if (!rows.some((r) => r.project.id === activeId)) setActiveId(rows[0]?.project.id ?? null);
  }, [rows, activeId]);

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    rowRefs.current.get(id)?.focus();
  };

  useImperativeHandle(ref, () => ({ focusFirstRow: () => focusRow(rows[0]?.project.id) }), [rows]);

  const handleRowKey = (e: KeyboardEvent<HTMLTableRowElement>, index: number, project: SavedProject) => {
    if (e.target !== e.currentTarget) return; // keys inside the rename field or menu button
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusRow(rows[Math.min(index + 1, rows.length - 1)]?.project.id);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (index === 0) onExitTop?.();
        else focusRow(rows[index - 1]?.project.id);
        break;
      case "Home":
        e.preventDefault();
        focusRow(rows[0]?.project.id);
        break;
      case "End":
        e.preventDefault();
        focusRow(rows[rows.length - 1]?.project.id);
        break;
      case "Enter":
        e.preventDefault();
        onOpen(project, e.metaKey || e.ctrlKey);
        break;
      case "F2":
        e.preventDefault();
        setRenamingId(project.id);
        break;
      case "Delete":
        e.preventDefault();
        // Move focus to a neighbour before the row disappears.
        focusRow((rows[index + 1] ?? rows[index - 1])?.project.id);
        onDelete(project);
        break;
    }
  };

  const handleRowClick = (e: MouseEvent<HTMLTableRowElement>, project: SavedProject) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [role='menu']")) return;
    onOpen(project, e.metaKey || e.ctrlKey);
  };

  const sortHeader = (key: SortKey, label: string, align: "left" | "right" = "left", width = "") => {
    const active = sort.key === key;
    const Arrow = sort.direction === "asc" ? ChevronUp : ChevronDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-3 py-2 font-normal", align === "right" && "text-right", width)}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className={cn(
            "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary motion-reduce:transition-none",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
          <Arrow size={12} aria-hidden="true" className={cn(!active && "invisible")} />
        </button>
      </th>
    );
  };

  return (
    <table className="-mx-3 w-[calc(100%+1.5rem)] table-fixed border-collapse text-left text-[14px]">
      <caption className="sr-only">
        Your projects. Use the arrow keys to move between rows, Enter to open, F2 to rename and Delete to delete.
      </caption>
      <thead className="hidden text-[12px] sm:table-header-group">
        <tr className="border-b border-rule">
          {sortHeader("name", "Name")}
          <th scope="col" className="hidden w-44 px-3 py-2 font-normal text-muted-foreground md:table-cell">
            Language
          </th>
          <th scope="col" className="hidden w-20 px-3 py-2 text-right font-normal text-muted-foreground md:table-cell">
            Files
          </th>
          {sortHeader("edited", "Last edited", "right", "w-40")}
          <th scope="col" className="w-14 px-3 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ project, matchedFile }, index) => {
          const fileCount = project.files?.length ?? 0;
          const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
          const ext = languageExtension(project.language);
          const relative = formatRelativeTime(project.updated_at, now);
          const full = formatFullDate(project.updated_at);
          const isActive = activeId === project.id;
          const renaming = renamingId === project.id;
          return (
            <tr
              key={project.id}
              ref={(el) => {
                if (el) rowRefs.current.set(project.id, el);
                else rowRefs.current.delete(project.id);
              }}
              tabIndex={isActive ? 0 : -1}
              aria-label={`${project.name}, ${languageLabel(project.language)}, ${fileLabel}, edited ${relative}`}
              onFocus={(e) => {
                if (e.target === e.currentTarget) setActiveId(project.id);
              }}
              onKeyDown={(e) => handleRowKey(e, index, project)}
              onClick={(e) => handleRowClick(e, project)}
              className={cn(
                "group flex cursor-pointer items-center border-b border-rule transition-colors hover:bg-panel focus-visible:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none sm:table-row",
                busyId === project.id && "opacity-60",
              )}
            >
              <td className="min-w-0 flex-1 py-3 pl-3 pr-2 sm:py-2.5">
                {renaming ? (
                  <RenameField
                    initial={project.name}
                    onCancel={() => {
                      setRenamingId(null);
                      focusRow(project.id);
                    }}
                    onSubmit={async (name) => {
                      const ok = name === project.name || (await onRename(project, name));
                      if (ok) {
                        setRenamingId(null);
                        focusRow(project.id);
                      }
                      return ok;
                    }}
                  />
                ) : (
                  <Link
                    to={`/editor?project=${project.id}`}
                    tabIndex={-1}
                    onClick={(e) => {
                      // Let the row handle plain clicks so modifier clicks behave like any link.
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                        e.preventDefault();
                        onOpen(project, false);
                      }
                    }}
                    className="block truncate font-medium text-foreground"
                  >
                    {project.name}
                  </Link>
                )}
                {!renaming && (project.description || matchedFile) && (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {matchedFile ? (
                      <>
                        Contains <span className="font-mono text-[11px]">{matchedFile}</span>
                      </>
                    ) : (
                      project.description
                    )}
                  </p>
                )}
                {/* Stacked metadata for narrow screens, where the other columns are hidden. */}
                <p className="mt-1 text-[12px] text-muted-foreground sm:hidden">
                  {languageLabel(project.language)}, {fileLabel},{" "}
                  <time dateTime={project.updated_at} title={full}>
                    {relative.charAt(0).toLowerCase() + relative.slice(1)}
                  </time>
                </p>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground md:table-cell">
                {languageLabel(project.language)}
                {ext && <span className="ml-2 font-mono text-[11px] text-faint">{ext}</span>}
              </td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">
                {fileCount}
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground sm:table-cell">
                <time dateTime={project.updated_at} title={full}>
                  {relative}
                </time>
              </td>
              <td className="w-14 shrink-0 px-2 py-2 text-right">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      tabIndex={isActive ? 0 : -1}
                      aria-label={`Actions for ${project.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary data-[state=open]:bg-raised data-[state=open]:text-foreground motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:group-focus-visible:opacity-100 sm:data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal size={16} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="min-w-[11rem] rounded-lg border-rule bg-raised p-1 shadow-float motion-reduce:animate-none"
                    onCloseAutoFocus={(e) => {
                      // Rename focuses its own field; everything else returns focus to the row.
                      if (renamingId === project.id) e.preventDefault();
                    }}
                  >
                    <DropdownMenuItem className={menuItemClass} onSelect={() => onOpen(project, false)}>
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem className={menuItemClass} onSelect={() => onOpen(project, true)}>
                      Open in new tab
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1 bg-rule" />
                    <DropdownMenuItem className={menuItemClass} onSelect={() => setRenamingId(project.id)}>
                      Rename
                      <span className="ml-auto font-mono text-[11px] text-faint">F2</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className={menuItemClass} onSelect={() => onDuplicate(project)}>
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1 bg-rule" />
                    <DropdownMenuItem
                      className={cn(menuItemClass, "text-danger focus:text-danger")}
                      onSelect={() => onDelete(project)}
                    >
                      Delete project
                      <span className="ml-auto font-mono text-[11px] text-faint">Del</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

function RenameField({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    // Wait a frame so a closing menu does not steal focus back.
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const submit = async () => {
    if (done.current || saving) return;
    const name = value.trim();
    if (!name) {
      done.current = true;
      onCancel();
      return;
    }
    setSaving(true);
    const ok = await onSubmit(name);
    setSaving(false);
    if (ok) done.current = true;
  };

  return (
    <input
      ref={inputRef}
      value={value}
      disabled={saving}
      aria-label="Project name"
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          void submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => void submit()}
      className="-my-1 h-8 w-full max-w-sm rounded-md border border-primary/60 bg-ink px-2 text-[14px] font-medium text-foreground focus-visible:outline-none"
    />
  );
}
