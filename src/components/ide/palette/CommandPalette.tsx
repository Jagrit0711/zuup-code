import { Command as CommandPrimitive } from "cmdk";
import { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "@/components/ide/settings/ModalShell";
import { cn } from "@/lib/utils";
import { highlightSegments, rankItems, type Ranked } from "./fuzzy";

export type PaletteMode = "commands" | "files" | "languages";

export interface PaletteCommand {
  id: string;
  label: string;
  /** Heading the command is listed under when nothing is typed. */
  group: string;
  /** Already formatted for the platform, e.g. "Ctrl+Enter". */
  shortcut?: string;
  keywords?: readonly string[];
  /** Shown instead of the shortcut, and the command cannot be chosen. Says what to do first. */
  disabledReason?: string;
  run: () => void;
}

export interface PaletteFile {
  id: string;
  /** Project-relative path, e.g. "src/main.py". */
  path: string;
}

export interface PaletteLanguage {
  id: string;
  label: string;
  extension: string;
}

interface CommandPaletteProps {
  open: boolean;
  mode: PaletteMode;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: PaletteMode) => void;
  commands: readonly PaletteCommand[];
  files: readonly PaletteFile[];
  activeFileId?: string;
  onOpenFile: (id: string) => void;
  languages: readonly PaletteLanguage[];
  currentLanguageId?: string;
  onPickLanguage: (id: string) => void;
}

const FILE_LIMIT_IN_COMMANDS = 6;
const FILE_LIMIT = 50;

interface FileEntry {
  label: string;
  keywords: string[];
  file: PaletteFile;
  dir: string;
}

interface LangEntry {
  label: string;
  keywords: string[];
  lang: PaletteLanguage;
}

const PLACEHOLDER: Record<PaletteMode, string> = {
  commands: "Type a command or a file name",
  files: "Go to a file by name",
  languages: "Choose a language for this file",
};

/**
 * Command palette: one input, a ranked list, keyboard first. Ctrl/Cmd+K opens commands, Ctrl/Cmd+P
 * opens it on files; typing ">" in file mode switches to commands like other editors do.
 */
const CommandPalette = ({
  open,
  mode,
  onOpenChange,
  onModeChange,
  commands,
  files,
  activeFileId,
  onOpenFile,
  languages,
  currentLanguageId,
  onPickLanguage,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A fresh, empty query every time it opens or the mode changes.
  useEffect(() => {
    if (open) setQuery("");
  }, [open, mode]);

  const fileEntries = useMemo<FileEntry[]>(
    () =>
      files.map((file) => {
        const slash = file.path.lastIndexOf("/");
        const label = slash >= 0 ? file.path.slice(slash + 1) : file.path;
        const dir = slash >= 0 ? file.path.slice(0, slash) : "";
        return { label, dir, file, keywords: dir ? [file.path] : [] };
      }),
    [files],
  );

  const langEntries = useMemo<LangEntry[]>(
    () => languages.map((lang) => ({ label: lang.label, lang, keywords: [lang.id, lang.extension] })),
    [languages],
  );

  const results = useMemo<{
    commands: Ranked<PaletteCommand>[];
    files: Ranked<FileEntry>[];
    languages: Ranked<LangEntry>[];
  }>(() => {
    if (mode === "languages") {
      return { commands: [], files: [], languages: rankItems(query, langEntries) };
    }
    if (mode === "files") {
      return { commands: [], files: rankItems(query, fileEntries, FILE_LIMIT), languages: [] };
    }
    const cmd = rankItems(query, commands);
    const fileHits = query.trim() ? rankItems(query, fileEntries, FILE_LIMIT_IN_COMMANDS) : [];
    return { commands: cmd, files: fileHits, languages: [] };
  }, [mode, query, commands, fileEntries, langEntries]);

  const firstCommand = results.commands.find((r) => !r.item.disabledReason);
  const firstValue = firstCommand
    ? `cmd:${firstCommand.item.id}`
    : results.files[0]
      ? `file:${results.files[0].item.file.id}`
      : results.languages[0]
        ? `lang:${results.languages[0].item.lang.id}`
        : "";

  // Highlight the best match whenever the results change.
  useEffect(() => {
    setSelected(firstValue);
    listRef.current?.scrollTo({ top: 0 });
  }, [firstValue, query, mode]);

  const close = () => onOpenChange(false);

  const runCommand = (c: PaletteCommand) => {
    if (c.disabledReason) return;
    close();
    // Let the dialog hand focus back before the command opens another dialog or moves focus.
    window.setTimeout(c.run, 0);
  };

  const onQueryChange = (value: string) => {
    if (mode === "files" && value.startsWith(">")) {
      onModeChange("commands");
      return;
    }
    setQuery(value);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace on an empty query leaves file or language mode for the full command list.
    if (e.key === "Backspace" && query === "" && mode !== "commands") {
      e.preventDefault();
      onModeChange("commands");
    }
  };

  const nothing = results.commands.length + results.files.length + results.languages.length === 0;
  const grouped = mode === "commands" && !query.trim();

  const commandItems = (list: Ranked<PaletteCommand>[]) =>
    list.map(({ item, indices }) => (
      <Row
        key={item.id}
        value={`cmd:${item.id}`}
        disabled={!!item.disabledReason}
        onSelect={() => runCommand(item)}
        label={item.label}
        indices={indices}
        dimUnmatched={!!query.trim()}
        trailing={
          item.disabledReason ? (
            <span className="text-[12px] text-faint">{item.disabledReason}</span>
          ) : item.shortcut ? (
            <span className="font-mono text-[11px] text-faint">{item.shortcut}</span>
          ) : null
        }
      />
    ));

  const groups = grouped
    ? results.commands.reduce<{ title: string; items: Ranked<PaletteCommand>[] }[]>((acc, r) => {
        const g = acc.find((x) => x.title === r.item.group);
        if (g) g.items.push(r);
        else acc.push({ title: r.item.group, items: [r] });
        return acc;
      }, [])
    : [];

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "files" ? "Go to file" : mode === "languages" ? "Change language" : "Command palette"}
      description="Type to search, use the arrow keys to move and Enter to choose."
      bare
      placement="top"
      className="max-w-[36rem]"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <CommandPrimitive
        shouldFilter={false}
        value={selected}
        onValueChange={setSelected}
        loop
        label={mode === "files" ? "Go to file" : mode === "languages" ? "Change language" : "Commands"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={onQueryChange}
            onKeyDown={onInputKeyDown}
            placeholder={PLACEHOLDER[mode]}
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-faint"
          />
          {mode === "files" ? (
            <span className="shrink-0 text-[12px] text-faint">
              Type <span className="font-mono">&gt;</span> for commands
            </span>
          ) : mode === "languages" ? (
            <span className="shrink-0 text-[12px] text-faint">Language</span>
          ) : null}
        </div>

        <CommandPrimitive.List ref={listRef} className="max-h-[min(24rem,56vh)] min-h-0 overflow-y-auto overscroll-contain p-1.5">
          {nothing ? (
            <div className="px-3 py-6 text-[13px] text-muted-foreground">
              {mode === "files" && files.length === 0
                ? "This project has no files yet."
                : `Nothing matches “${query.trim()}”.`}
            </div>
          ) : null}

          {grouped
            ? groups.map((g) => (
                <CommandPrimitive.Group key={g.title} heading={g.title} className={groupClass}>
                  {commandItems(g.items)}
                </CommandPrimitive.Group>
              ))
            : results.commands.length > 0 && (
                <CommandPrimitive.Group heading="Commands" className={groupClass}>
                  {commandItems(results.commands)}
                </CommandPrimitive.Group>
              )}

          {results.files.length > 0 && (
            <CommandPrimitive.Group heading={mode === "files" ? undefined : "Files"} className={groupClass}>
              {results.files.map(({ item, indices }) => (
                <Row
                  key={item.file.id}
                  value={`file:${item.file.id}`}
                  onSelect={() => {
                    close();
                    onOpenFile(item.file.id);
                  }}
                  label={item.label}
                  indices={indices}
                  dimUnmatched={!!query.trim()}
                  detail={item.dir ? <span className="truncate font-mono text-[11px] text-faint">{item.dir}</span> : null}
                  trailing={item.file.id === activeFileId ? <span className="text-[12px] text-faint">Open</span> : null}
                />
              ))}
            </CommandPrimitive.Group>
          )}

          {results.languages.length > 0 && (
            <CommandPrimitive.Group className={groupClass}>
              {results.languages.map(({ item, indices }) => (
                <Row
                  key={item.lang.id}
                  value={`lang:${item.lang.id}`}
                  onSelect={() => {
                    close();
                    onPickLanguage(item.lang.id);
                  }}
                  label={item.label}
                  indices={indices}
                  dimUnmatched={!!query.trim()}
                  detail={<span className="font-mono text-[11px] text-faint">{item.lang.extension}</span>}
                  trailing={item.lang.id === currentLanguageId ? <span className="text-[12px] text-faint">Current</span> : null}
                />
              ))}
            </CommandPrimitive.Group>
          )}
        </CommandPrimitive.List>

        <div className="hidden h-9 shrink-0 items-center gap-5 border-t border-rule px-4 text-[12px] text-faint sm:flex">
          <span>
            <span className="font-mono text-[11px]">↑ ↓</span> to move
          </span>
          <span>
            <span className="font-mono text-[11px]">Enter</span> to {mode === "commands" ? "run" : "open"}
          </span>
          <span>
            <span className="font-mono text-[11px]">Esc</span> to close
          </span>
        </div>
      </CommandPrimitive>
    </ModalShell>
  );
};

const groupClass =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground";

interface RowProps {
  value: string;
  label: string;
  indices: number[];
  dimUnmatched: boolean;
  onSelect: () => void;
  disabled?: boolean;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
}

const Row = ({ value, label, indices, dimUnmatched, onSelect, disabled, detail, trailing }: RowProps) => (
  <CommandPrimitive.Item
    value={value}
    disabled={disabled}
    onSelect={onSelect}
    className={cn(
      "group flex h-8 cursor-pointer select-none items-center gap-3 rounded-md px-2.5 text-[13px] outline-none",
      "data-[selected=true]:bg-ink/70",
      disabled ? "cursor-default text-faint" : "text-foreground",
    )}
  >
    <span className="flex min-w-0 items-baseline gap-2.5">
      <span className="truncate">
        {highlightSegments(label, indices).map((seg, i) =>
          seg.match ? (
            <span key={i} className="font-semibold text-foreground">
              {seg.text}
            </span>
          ) : (
            <span key={i} className={cn(dimUnmatched && indices.length > 0 && !disabled && "text-muted-foreground")}>
              {seg.text}
            </span>
          ),
        )}
      </span>
      {detail}
    </span>
    {trailing ? <span className="ml-auto shrink-0">{trailing}</span> : null}
  </CommandPrimitive.Item>
);

export default CommandPalette;
