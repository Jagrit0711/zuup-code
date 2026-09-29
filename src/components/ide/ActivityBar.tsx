import { Files, Search, History, Settings, User as UserIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";
import type { SidebarTab } from "./Sidebar";

interface ActivityBarProps {
  activeTab: SidebarTab;
  sidebarOpen: boolean;
  onTabChange: (tab: SidebarTab) => void;
  onOpenSettings: () => void;
  user?: User | null;
  profile?: Profile | null;
}

const ActivityBar = ({
  activeTab,
  sidebarOpen,
  onTabChange,
  onOpenSettings,
  user,
  profile,
}: ActivityBarProps) => {
  const handleItemClick = (tab: SidebarTab) => {
    onTabChange(tab);
  };

  const displayName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "";

  return (
    <div className="flex h-full w-12 flex-col items-center justify-between border-r border-border bg-[#0a0c13] py-2 shrink-0 select-none z-10">
      {/* Top action icons */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Explorer button */}
        <button
          onClick={() => handleItemClick("explorer")}
          className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
            sidebarOpen && activeTab === "explorer"
              ? "text-primary bg-primary/10 shadow-sm"
              : "text-muted-foreground/70 hover:bg-secondary/60 hover:text-foreground"
          }`}
          title="Explorer (Ctrl+Shift+E)"
        >
          {sidebarOpen && activeTab === "explorer" && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
          )}
          <Files size={18} />
        </button>

        {/* Search button */}
        <button
          onClick={() => handleItemClick("search")}
          className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
            sidebarOpen && activeTab === "search"
              ? "text-primary bg-primary/10 shadow-sm"
              : "text-muted-foreground/70 hover:bg-secondary/60 hover:text-foreground"
          }`}
          title="Search across files (Ctrl+Shift+F)"
        >
          {sidebarOpen && activeTab === "search" && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
          )}
          <Search size={18} />
        </button>

        {/* Timeline / History button */}
        <button
          onClick={() => handleItemClick("timeline")}
          className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
            sidebarOpen && activeTab === "timeline"
              ? "text-primary bg-primary/10 shadow-sm"
              : "text-muted-foreground/70 hover:bg-secondary/60 hover:text-foreground"
          }`}
          title="Timeline & Revision History"
        >
          {sidebarOpen && activeTab === "timeline" && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
          )}
          <History size={18} />
        </button>
      </div>

      {/* Bottom utility icons */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        <button
          onClick={onOpenSettings}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-secondary/60 hover:text-foreground transition-all"
          title="Settings (Ctrl+,)"
        >
          <Settings size={18} />
        </button>

        {user ? (
          <Link
            to="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ring-1 ring-border/50 hover:ring-primary transition-all"
            title={`Dashboard (${displayName})`}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>
        ) : (
          <Link
            to="/login"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-secondary/60 hover:text-foreground transition-all"
            title="Sign In"
          >
            <UserIcon size={16} />
          </Link>
        )}
      </div>
    </div>
  );
};

export default ActivityBar;
