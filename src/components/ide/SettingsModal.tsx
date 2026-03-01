import { X, Type, Monitor } from "lucide-react";
import { useState } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  tabSize: number;
  onTabSizeChange: (size: number) => void;
  wordWrap: boolean;
  onWordWrapChange: (wrap: boolean) => void;
}

const SettingsModal = ({
  isOpen,
  onClose,
  fontSize,
  onFontSizeChange,
  tabSize,
  onTabSizeChange,
  wordWrap,
  onWordWrapChange,
}: SettingsModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl glass-strong glow-primary p-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5 p-5">
          {/* Font Size */}
          <div className="space-y-2">
            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Font Size</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{fontSize}px</span>
            </label>
            <input
              type="range"
              min={10}
              max={24}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-full accent-primary h-1.5 rounded-full appearance-none bg-secondary cursor-pointer"
            />
          </div>

          {/* Tab Size */}
          <div className="space-y-2">
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Tab Size</span>
              <span className="text-xs text-muted-foreground font-mono">{tabSize} spaces</span>
            </label>
            <div className="flex gap-2">
              {[2, 4, 8].map((size) => (
                <button
                  key={size}
                  onClick={() => onTabSizeChange(size)}
                  className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                    tabSize === size
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Word Wrap */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Word Wrap</span>
            <button
              onClick={() => onWordWrapChange(!wordWrap)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                wordWrap ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-foreground transition-transform ${
                  wordWrap ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground transition-colors hover:brightness-110"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
