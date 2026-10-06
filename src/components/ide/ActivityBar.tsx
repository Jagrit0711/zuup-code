import type { ReactNode } from "react";
import { Files, Github, History, Search, Settings } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";
import Hint from "@/components/ide/chrome/Hint";
import type { SidebarTab } from "./Sidebar";

interface ActivityBarProps {
  activeTab: SidebarTab;
  sidebarOpen: boolean;
  onTabChange: (tab: SidebarTab) => void;
  onOpenSettings: () => void;
  onOpenGitHub?: () => void;
  /** Kept for compatibility; the account avatar now lives in the top bar. */
  user?: User | null;
  /** Kept for compatibility; the account avatar now lives in the top bar. */
  profile?: Profile | null;
}

interface ItemProps {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

const Item = ({ label, shortcut, active = false, onClick, children }: ItemProps) => (
  <Hint label={label} shortcut={shortcut} side="right">
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`relative flex h-11 w-full items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary ${
        active ? "text-foreground" : "text-faint hover:text-foreground"
      }`}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-[2px] bg-primary" aria-hidden="true" />}
      {children}
    </button>
  </Hint>
);

const ICON = { size: 20, strokeWidth: 1.5 } as const;

const ActivityBar = ({ activeTab, sidebarOpen, onTabChange, onOpenSettings, onOpenGitHub }: ActivityBarProps) => (
  <nav
    aria-label="Side panels"
    className="z-20 flex h-full w-12 shrink-0 select-none flex-col justify-between border-r border-rule bg-panel py-1"
  >
    <div className="flex flex-col">
      <Item label="Explorer" shortcut="Ctrl+Shift+E" active={sidebarOpen && activeTab === "explorer"} onClick={() => onTabChange("explorer")}>
        <Files {...ICON} />
      </Item>
      <Item label="Search" shortcut="Ctrl+Shift+F" active={sidebarOpen && activeTab === "search"} onClick={() => onTabChange("search")}>
        <Search {...ICON} />
      </Item>
      <Item label="Timeline" active={sidebarOpen && activeTab === "timeline"} onClick={() => onTabChange("timeline")}>
        <History {...ICON} />
      </Item>
      {onOpenGitHub && (
        <Item label="GitHub sync" onClick={onOpenGitHub}>
          <Github {...ICON} />
        </Item>
      )}
    </div>

    <div className="flex flex-col">
      <Item label="Settings" shortcut="Ctrl+," onClick={onOpenSettings}>
        <Settings {...ICON} />
      </Item>
    </div>
  </nav>
);

export default ActivityBar;
