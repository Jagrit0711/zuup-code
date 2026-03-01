import { Play, Save, Download, Share2, Plus, ChevronDown } from "lucide-react";
import { LanguageConfig, languages } from "@/lib/languages";
import zuupLogo from "@/assets/zuup-logo.png";

interface TopBarProps {
  activeLanguage: LanguageConfig;
  activeFileName: string;
  onRun: () => void;
  onSave: () => void;
  onDownload: () => void;
  onShare: () => void;
  onNewFile: () => void;
  onLanguageChange: (id: string) => void;
  isRunning: boolean;
}

const TopBar = ({
  activeLanguage,
  activeFileName,
  onRun,
  onSave,
  onDownload,
  onShare,
  onNewFile,
  onLanguageChange,
  isRunning,
}: TopBarProps) => {
  return (
    <div className="flex h-11 items-center justify-between border-b border-border glass-strong px-3 shrink-0">
      <div className="flex items-center gap-2.5">
        <img src={zuupLogo} alt="Zuup" className="h-6 w-6" />
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold text-foreground">Zuup</span>
          <span className="text-sm font-light text-primary">Code</span>
        </div>
        <div className="mx-2 h-4 w-px bg-border" />
        <select
          value={activeLanguage.id}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="rounded bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground outline-none ring-1 ring-border transition-colors hover:ring-primary focus:ring-primary cursor-pointer"
        >
          {languages.map((lang) => (
            <option key={lang.id} value={lang.id} className="bg-popover">
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onNewFile}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="New File"
        >
          <Plus size={13} />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          onClick={onSave}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Save"
        >
          <Save size={13} />
          <span className="hidden sm:inline">Save</span>
        </button>

        <button
          onClick={onDownload}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Download"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Download</span>
        </button>

        <button
          onClick={onShare}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Share"
        >
          <Share2 size={13} />
          <span className="hidden sm:inline">Share</span>
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        <button
          onClick={onRun}
          disabled={isRunning}
          className={`flex items-center gap-1.5 rounded px-4 py-1.5 text-[11px] font-semibold transition-all ${
            isRunning
              ? "bg-primary/30 text-primary/60 cursor-wait"
              : "bg-primary text-primary-foreground hover:brightness-110 glow-primary-sm hover:glow-primary"
          }`}
        >
          <Play size={11} fill="currentColor" />
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>
    </div>
  );
};

export default TopBar;
