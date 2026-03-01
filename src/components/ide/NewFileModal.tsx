import { X, FileCode, Plus } from "lucide-react";
import { useState } from "react";
import { languages } from "@/lib/languages";

interface NewFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFile: (name: string, languageId: string) => void;
}

const NewFileModal = ({ isOpen, onClose, onCreateFile }: NewFileModalProps) => {
  const [fileName, setFileName] = useState("");
  const [selectedLang, setSelectedLang] = useState("javascript");

  if (!isOpen) return null;

  const handleCreate = () => {
    const lang = languages.find((l) => l.id === selectedLang);
    const name = fileName.trim() || `untitled${lang?.extension || ".txt"}`;
    const finalName = name.includes(".") ? name : `${name}${lang?.extension || ".txt"}`;
    onCreateFile(finalName, selectedLang);
    setFileName("");
    setSelectedLang("javascript");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl glass-strong glow-primary p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">New File</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="untitled"
              className="w-full rounded-md bg-secondary px-3 py-2 text-xs text-foreground outline-none ring-1 ring-border font-mono placeholder:text-muted-foreground focus:ring-primary"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Language</label>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="w-full rounded-md bg-secondary px-3 py-2 text-xs text-foreground outline-none ring-1 ring-border cursor-pointer focus:ring-primary"
            >
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-popover">
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={handleCreate} className="rounded px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:brightness-110">
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewFileModal;
