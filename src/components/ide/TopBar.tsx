import { Play, Save, Download, Share2, Moon, Maximize2 } from "lucide-react";
import { LanguageConfig, languages } from "@/lib/languages";
import zuupLogo from "@/assets/zuup-logo.png";

interface TopBarProps {
  activeLanguage: LanguageConfig;
  onRun: () => void;
  onLanguageChange: (id: string) => void;
  isRunning: boolean;
}

const TopBar = ({ activeLanguage, onRun, onLanguageChange, isRunning }: TopBarProps) => {
  return (
    <div className="flex h-12 items-center justify-between border-b border-border glass-strong px-4">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3">
        <img src={zuupLogo} alt="Zuup" className="h-7 w-7" />
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-foreground">Zuup</span>
          <span className="text-sm font-light text-primary">Code</span>
        </div>
        <div className="mx-3 h-5 w-px bg-border" />
        {/* Language selector */}
        <select
          value={activeLanguage.id}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="rounded-md bg-secondary px-3 py-1 text-xs font-medium text-foreground outline-none ring-1 ring-border transition-colors hover:ring-primary focus:ring-primary"
        >
          {languages.map((lang) => (
            <option key={lang.id} value={lang.id} className="bg-popover">
              {lang.icon} {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Center: File tab */}
      <div className="flex items-center">
        <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1 glow-primary-sm">
          <span className="text-xs text-primary">{activeLanguage.icon}</span>
          <span className="text-xs font-mono font-medium text-primary">
            main{activeLanguage.extension}
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onRun}
          disabled={isRunning}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-all ${
            isRunning
              ? "bg-primary/30 text-primary/60 cursor-wait"
              : "bg-primary text-primary-foreground hover:brightness-110 glow-primary-sm hover:glow-primary"
          }`}
        >
          <Play size={12} fill="currentColor" />
          {isRunning ? "Running..." : "Run"}
        </button>

        <div className="mx-1 h-5 w-px bg-border" />

        <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Save">
          <Save size={15} />
        </button>
        <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Download">
          <Download size={15} />
        </button>
        <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Share">
          <Share2 size={15} />
        </button>
      </div>
    </div>
  );
};

export default TopBar;
