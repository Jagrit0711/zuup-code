import { X, FolderPlus, FileCode } from "lucide-react";
import { useState } from "react";
import { projectTemplates, ProjectTemplate } from "@/lib/projectTemplates";
import { FileTab } from "@/lib/fileSystem";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (template: ProjectTemplate) => void;
}

const NewProjectModal = ({ isOpen, onClose, onCreateProject }: NewProjectModalProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  if (!isOpen) return null;

  const handleCreate = () => {
    const template = projectTemplates.find(t => t.id === selectedTemplate);
    if (template) {
      onCreateProject(template);
      setSelectedTemplate("");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl glass-strong glow-primary p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FolderPlus size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">New Project</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Choose a Project Template</h3>
            <p className="text-xs text-muted-foreground">Start with a pre-configured project structure</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {projectTemplates.map((template) => (
              <div
                key={template.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:bg-secondary/50 ${
                  selectedTemplate === template.id 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border'
                }`}
                onClick={() => setSelectedTemplate(template.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{template.icon}</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">
                      {template.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileCode size={12} />
                      <span>{template.files.length} files</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedTemplate && (
            <div className="bg-secondary/50 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-foreground mb-2">Project Files:</h4>
              <div className="space-y-1">
                {projectTemplates.find(t => t.id === selectedTemplate)?.files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileCode size={12} />
                    <span className="font-mono">{file.path}{file.fileName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedTemplate}
              className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;