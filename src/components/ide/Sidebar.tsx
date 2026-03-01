import { ChevronRight, File, FolderOpen, Plus, Settings } from "lucide-react";
import { languages, LanguageConfig } from "@/lib/languages";

interface SidebarProps {
  activeLanguage: string;
  onSelectLanguage: (id: string) => void;
}

const Sidebar = ({ activeLanguage, onSelectLanguage }: SidebarProps) => {
  return (
    <div className="flex h-full w-56 flex-col glass-strong border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Explorer
        </span>
        <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Plus size={14} />
        </button>
      </div>

      {/* Project tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-2">
          <div className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground">
            <FolderOpen size={14} className="text-primary" />
            <span>zuup-project</span>
          </div>
        </div>

        <div className="ml-2 space-y-0.5">
          {languages.map((lang: LanguageConfig) => (
            <button
              key={lang.id}
              onClick={() => onSelectLanguage(lang.id)}
              className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs font-mono transition-all ${
                activeLanguage === lang.id
                  ? "bg-primary/10 text-primary glow-primary-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <File size={12} />
              <span>main{lang.extension}</span>
              {activeLanguage === lang.id && (
                <ChevronRight size={10} className="ml-auto" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
