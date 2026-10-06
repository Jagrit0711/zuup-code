import { X, FolderPlus, FileCode, Upload, Sparkles, FilePlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { getLanguageById, getLanguagesByGroup } from "@/lib/languages";
import { readTextFiles } from "@/lib/fileSystem";

export interface NewProjectData {
  name: string;
  description: string;
  language: string;
  uploadedFiles: { name: string; content: string }[];
}

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (data: NewProjectData) => void;
  /** Language preselected in the picker (usually the language of the file being edited). */
  defaultLanguage?: string;
}

const ACCEPTED_EXTENSIONS =
  ".py,.js,.mjs,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.hpp,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.cs,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.csv,.sh,.pl,.scala,.hs,.clj,.ex,.exs,.nim";

type Source = "blank" | "upload";

const NewProjectModal = ({ isOpen, onClose, onCreateProject, defaultLanguage = "python" }: NewProjectModalProps) => {
  const [step, setStep] = useState<"info" | "source">("info");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [source, setSource] = useState<Source>("blank");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; content: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const descId = useId();
  const langId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Start each opening from a clean form with the caller's preferred language.
  useEffect(() => {
    if (isOpen) {
      setStep("info");
      setName("");
      setDescription("");
      setLanguage(defaultLanguage);
      setSource("blank");
      setUploadedFiles([]);
      // The menu that opened this dialog may still be returning focus; claim it afterwards.
      const t = setTimeout(() => nameInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen, defaultLanguage]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const { files, skipped } = await readTextFiles(list);
    if (skipped.length > 0) {
      toast.error(`Skipped ${skipped.length} file${skipped.length > 1 ? "s" : ""}`, {
        description: "Only text files up to 1 MB can be imported.",
      });
    }
    setUploadedFiles((prev) => {
      const known = new Set(prev.map((f) => f.name.toLowerCase()));
      const fresh = files.filter((f) => {
        const key = f.name.toLowerCase();
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      return [...prev, ...fresh];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const handleCreate = () => {
    onCreateProject({
      name: name.trim() || "Untitled Project",
      description: description.trim(),
      language,
      uploadedFiles: source === "upload" ? uploadedFiles : [],
    });
    onClose();
  };

  const canProceed = name.trim().length > 0;
  const canCreate = source === "blank" || uploadedFiles.length > 0;
  const selectedLang = getLanguageById(language);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-xl max-h-[88vh] flex flex-col rounded-xl glass-strong glow-primary shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <FolderPlus size={16} className="text-primary" />
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              {step === "info" ? "New Project" : "Choose Starting Point"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "info" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor={nameId} className="block text-xs font-medium text-foreground mb-1.5">
                  Project Name <span className="text-primary">*</span>
                </label>
                <input
                  id={nameId}
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  autoFocus
                  maxLength={80}
                  className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  onKeyDown={(e) => e.key === "Enter" && canProceed && setStep("source")}
                />
              </div>

              <div>
                <label htmlFor={descId} className="block text-xs font-medium text-foreground mb-1.5">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id={descId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this project do?"
                  rows={2}
                  className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all resize-none"
                />
              </div>

              <div>
                <label htmlFor={langId} className="block text-xs font-medium text-foreground mb-1.5">
                  Primary Language
                </label>
                <select
                  id={langId}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all cursor-pointer"
                >
                  {getLanguagesByGroup().map((group) => (
                    <optgroup key={group.id} label={group.label} className="bg-popover">
                      {group.languages.map((lang) => (
                        <option key={lang.id} value={lang.id} className="bg-popover">
                          {lang.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Source type selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Starting point">
                {([
                  { id: "blank" as const, label: "Blank", desc: "One empty file", Icon: FilePlus },
                  { id: "upload" as const, label: "Upload", desc: "Start from your own files", Icon: Upload },
                ]).map(({ id, label, desc, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={source === id}
                    onClick={() => setSource(id)}
                    className={`rounded-lg border-2 p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      source === id ? "border-primary bg-primary/10" : "border-border/40 hover:border-border"
                    }`}
                  >
                    <Icon size={18} className="mb-1.5 text-primary" />
                    <div className="text-xs font-medium text-foreground">{label}</div>
                    <div className="text-[10px] text-muted-foreground">{desc}</div>
                  </button>
                ))}
              </div>

              {/* Blank */}
              {source === "blank" && (
                <div className="rounded-lg bg-secondary/30 border border-border/30 p-4">
                  <p className="text-xs text-foreground/80">
                    Creates an empty{" "}
                    <span className="text-primary font-mono">main{selectedLang.extension}</span> for{" "}
                    <span className="text-primary font-semibold">{selectedLang.label}</span>. Nothing is pre-filled, so
                    you start with a clean editor.
                  </p>
                </div>
              )}

              {/* Upload */}
              {source === "upload" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept={ACCEPTED_EXTENSIONS}
                    aria-label="Upload code files"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 p-6 text-center transition-all hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs font-medium text-foreground">Click to upload files</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Select one or more text files (max 1 MB each)
                    </p>
                  </button>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""} selected:
                      </p>
                      {uploadedFiles.map((f) => (
                        <div
                          key={f.name}
                          className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCode size={12} className="text-primary shrink-0" />
                            <span className="text-xs font-mono text-foreground truncate">{f.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {(f.content.length / 1024).toFixed(1)}KB
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveFile(f.name)}
                            aria-label={`Remove ${f.name}`}
                            className="text-muted-foreground hover:text-destructive ml-2 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-between shrink-0">
          {step === "source" ? (
            <button
              onClick={() => setStep("info")}
              className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}

          {step === "info" ? (
            <button
              onClick={() => setStep("source")}
              disabled={!canProceed}
              className="px-5 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className="px-5 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-1.5"
            >
              <Sparkles size={12} />
              Create Project
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;
