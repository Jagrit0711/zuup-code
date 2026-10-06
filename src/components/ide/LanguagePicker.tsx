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
          className="flex items-center gap-1.5 rounded-md bg-secondary/60 px-2 py-1 text-[11px] font-medium text-foreground outline-none ring-1 ring-border/50 transition-all hover:ring-primary/50 focus-visible:ring-primary data-[state=open]:ring-primary"
        >
          <span>{value.label}</span>
          <ChevronDown size={10} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0 z-[110]">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search languages..." className="h-9 text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-5 text-center text-xs text-muted-foreground">No language found.</CommandEmpty>
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
                    className="gap-2 text-xs"
                  >
                    <Check size={12} className={lang.id === value.id ? "text-primary" : "opacity-0"} />
                    <span className="flex-1 truncate">{lang.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{lang.extension}</span>
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
