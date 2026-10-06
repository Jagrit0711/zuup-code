import { useRef, useState } from "react";
import { FilePlus, FolderPlus, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { languages, getLanguageById, POPULAR_LANGUAGE_IDS } from "@/lib/languages";
import { readTextFiles } from "@/lib/fileSystem";

interface EditorEmptyStateProps {
  /** "no-files": the workspace is empty. "no-open-file": files exist but every tab is closed. */
  variant: "no-files" | "no-open-file";
  onNewFile: () => void;
  onNewProject: () => void;
  /** Creates an empty file for the chosen language. */
  onCreateWithLanguage: (languageId: string) => void;
  onUploadFiles: (files: { name: string; content: string }[]) => void;
}

const ACCEPTED_EXTENSIONS =
  ".py,.js,.mjs,.ts,.jsx,.tsx,.html,.css,.c,.cpp,.h,.hpp,.java,.go,.rs,.rb,.php,.lua,.swift,.kt,.cs,.dart,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.csv,.sh,.pl,.scala,.hs,.clj,.ex,.exs,.nim";

const EditorEmptyState = ({
  variant,
  onNewFile,
  onNewProject,
  onCreateWithLanguage,
  onUploadFiles,
}: EditorEmptyStateProps) => {
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBlank = variant === "no-files";

  const chips = showAll ? languages : POPULAR_LANGUAGE_IDS.map((id) => getLanguageById(id));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const { files, skipped } = await readTextFiles(list);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (skipped.length > 0) {
      toast.error(`Skipped ${skipped.length} file${skipped.length > 1 ? "s" : ""}`, {
        description: "Only text files up to 1 MB can be imported.",
      });
    }
    if (files.length > 0) onUploadFiles(files);
  };

  return (
    <div className="h-full overflow-y-auto bg-background/50 backdrop-blur-xl">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center space-y-6 px-4 py-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 shadow-lg shadow-primary/10">
          <FilePlus size={28} className="text-primary/80" />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            {isBlank ? "Start with a blank file" : "No file open"}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isBlank
              ? "Everything starts empty. Create a file, pick a language, or bring your own code. Your work is kept in this browser until you save it to a project."
              : "Choose a file from the Explorer, or create a new one."}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onNewFile}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-primary-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus size={16} />
            New file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleUpload}
            className="hidden"
            aria-label="Upload files"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Upload size={15} />
            Upload files
          </button>
        </div>

        {isBlank && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Or start an empty file in
            </p>
            <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Pick a language">
              {chips.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onCreateWithLanguage(lang.id)}
                  title={`New empty ${lang.label} file (main${lang.extension})`}
                  className="rounded-full border border-border/50 bg-secondary/40 px-3 py-1 text-[11px] font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {lang.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="rounded-full border border-dashed border-border/60 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {showAll ? "Fewer" : "More languages"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground/70">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border/50 bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px]">Ctrl+N</kbd>
            New file
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border/50 bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px]">Ctrl+Shift+N</kbd>
            <button
              type="button"
              onClick={onNewProject}
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
            >
              <FolderPlus size={11} />
              New project
            </button>
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/50">
          If your browser keeps those shortcuts, Alt+N and Alt+Shift+N work too.
        </p>
      </div>
    </div>
  );
};

export default EditorEmptyState;
