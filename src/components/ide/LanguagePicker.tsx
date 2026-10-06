import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getLanguagesByGroup, type LanguageConfig } from "@/lib/languages";

interface LanguagePickerProps {
  value: LanguageConfig;
  onChange: (id: string) => void;
  /** Accessible description of what picking a language does. */
  title?: string;
}

/** Searchable, grouped language dropdown (the registry has ~30 entries, too many for a flat select). */
const LanguagePicker = ({ value, onChange, title = "Language" }: LanguagePickerProps) => {
  const [open, setOpen] = useState(false);
  const groups = getLanguagesByGroup();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${title}: ${value.label}`}
          title={title}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary data-[state=open]:bg-raised data-[state=open]:text-foreground"
        >
          <span>{value.label}</span>
          <ChevronDown size={12} className="text-faint" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[110] w-64 rounded-lg border-rule bg-raised p-0 shadow-float">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search languages" className="h-9 text-[13px] placeholder:text-faint" />
          <CommandList className="max-h-72">
            <CommandEmpty className="px-3 py-4 text-[13px] text-muted-foreground">No language matches that search.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.label}>
                {group.languages.map((lang) => (
                  <CommandItem
                    key={lang.id}
                    value={`${lang.label} ${lang.id} ${lang.extension}`}
                    onSelect={() => {
                      onChange(lang.id);
                      setOpen(false);
                    }}
                    className="gap-2 rounded-md text-[13px]"
                  >
                    <Check size={13} className={lang.id === value.id ? "text-foreground" : "opacity-0"} aria-hidden="true" />
                    <span className="flex-1 truncate">{lang.label}</span>
                    <span className="font-mono text-[11px] text-faint">{lang.extension}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default LanguagePicker;
