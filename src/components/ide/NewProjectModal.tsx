import { X, FolderPlus, FileCode, Upload, Sparkles } from "lucide-react";
import { useState, useRef } from "react";
import { projectTemplates, ProjectTemplate } from "@/lib/projectTemplates";
import { languages } from "@/lib/languages";

export interface NewProjectData {
  name: string;
  description: string;
  language: string;
  template: ProjectTemplate | null;
  uploadedFiles: { name: string; content: string }[];
}

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (data: NewProjectData) => void;
}

const NewProjectModal = ({ isOpen, onClose, onCreateProject }: NewProjectModalProps) => {
  const [step, setStep] = useState<"info" | "source">("info");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("python");
  const [source, setSource] = useState<"blank" | "template" | "upload">("blank");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; content: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStep("info");
    setName("");
    setDescription("");
    setLanguage("python");
    setSource("blank");
    setSelectedTemplate("");
    setUploadedFiles([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    Array.from(fileList).forEach((file) => {
      if (file.size > 1024 * 1024) return;

      const reader = new FileReader();
      reader.onload = () => {
        setUploadedFiles((prev) => {
          if (prev.some((f) => f.name === file.name)) return prev;
          return [...prev, { name: file.name, content: reader.result as string }];
        });
      };
      reader.readAsText(file);
    });

    e.target.value = "";
  };

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const handleCreate = () => {
    const template = source === "template"
      ? projectTemplates.find((t) => t.id === selectedTemplate) || null
      : null;

    onCreateProject({
      name: name.trim() || "Untitled Project",
      description: description.trim(),
      language,
      template,
      uploadedFiles: source === "upload" ? uploadedFiles : [],
    });

    reset();
    onClose();
  };

  const canProceed = name.trim().length > 0;
  const canCreate =
    source === "blank" ||
    (source === "template" && selectedTemplate) ||
    (source === "upload" && uploadedFiles.length > 0);

  const selectedLang = languages.find((l) => l.id === language);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl glass-strong glow-primary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <FolderPlus size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {step === "info" ? "New Project" : "Choose Starting Point"}
            </h2>
          </div>
          <button onClick={handleClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "info" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Project Name <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  autoFocus
                  className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  onKeyDown={(e) => e.key === "Enter" && canProceed && setStep("source")}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this project do?"
                  rows={2}
                  className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Primary Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all cursor-pointer"
                >
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id} className="bg-popover">
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Source type selector */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "blank" as const, label: "Blank", icon: "📄", desc: "Empty file" },
                  { id: "template" as const, label: "Template", icon: "✨", desc: "Pre-built starter" },
                  { id: "upload" as const, label: "Upload", icon: "📁", desc: "Your own files" },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSource(opt.id)}
                    className={`rounded-lg border-2 p-3 text-left transition-all ${
                      source === opt.id
                        ? "border-primary bg-primary/10"
                        : "border-border/40 hover:border-border"
                    }`}
                  >
                    <div className="text-lg mb-1">{opt.icon}</div>
                    <div className="text-xs font-medium text-foreground">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {/* Blank */}
              {source === "blank" && (
                <div className="rounded-lg bg-secondary/30 border border-border/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    Creates a project with a single <span className="text-primary font-mono">
                      main{selectedLang?.extension || ".py"}
                    </span> file using {selectedLang?.label || "Python"} starter code.
                  </p>
                </div>
              )}

              {/* Template picker */}
              {source === "template" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {projectTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`border-2 rounded-lg p-3.5 cursor-pointer transition-all hover:bg-secondary/50 ${
                        selectedTemplate === template.id
                          ? "border-primary bg-primary/10"
                          : "border-border/40"
                      }`}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="text-xl">{template.icon}</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-medium text-foreground mb-0.5 truncate">
                            {template.name}
                          </h4>
                          <p className="text-[10px] text-muted-foreground mb-1.5 line-clamp-2">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                            <FileCode size={10} />
                            <span>{template.files.length} files</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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
                    accept=".py,.js,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.sh,.bat"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 p-6 text-center transition-all hover:bg-primary/5"
                  >
                    <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs font-medium text-foreground">Click to upload files</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Select one or more code files (max 1MB each)
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
                            className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
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
              onClick={handleClose}
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