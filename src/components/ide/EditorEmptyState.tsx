import { useRef, useState } from "react";
import { toast } from "sonner";
import { languages, getLanguageById, POPULAR_LANGUAGE_IDS } from "@/lib/languages";
import { readTextFiles } from "@/lib/fileSystem";
import { shortcutFor } from "@/components/ide/palette/shortcuts";

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

const focus = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

const EditorEmptyState = ({ variant, onNewFile, onNewProject, onCreateWithLanguage, onUploadFiles }: EditorEmptyStateProps) => {
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBlank = variant === "no-files";

  const shown = showAll ? languages : POPULAR_LANGUAGE_IDS.map((id) => getLanguageById(id));

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
    <div className="h-full overflow-y-auto bg-ink">
      <div className="w-full min-w-0 max-w-[38rem] px-6 pb-10 pt-[min(10vh,5rem)] sm:px-14">
        <h2 className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
          {isBlank ? "Start with a blank file" : "No file open"}
        </h2>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
          {isBlank
            ? "This workspace is empty. Create a file, or bring in code you already have. Your work stays in this browser until you save it to a project."
            : "Pick a file in the Explorer to keep working, or create a new one."}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onNewFile}
            className={`inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 ${focus} focus-visible:ring-offset-2 focus-visible:ring-offset-ink`}
          >
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
            className={`inline-flex h-8 items-center rounded-md border border-rule bg-transparent px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-raised ${focus}`}
          >
            Upload files
          </button>
        </div>

        {isBlank && (
          <section className="mt-8" aria-labelledby="empty-languages">
            <h3 id="empty-languages" className="text-[12px] font-semibold text-muted-foreground">
              Or start an empty file in
            </h3>
            <ul className="mt-2 grid max-w-[31rem] grid-cols-2 gap-x-4 sm:grid-cols-3" role="list">
              {shown.map((lang) => (
                <li key={lang.id}>
                  <button
                    type="button"
                    onClick={() => onCreateWithLanguage(lang.id)}
                    title={`New empty ${lang.label} file (main${lang.extension})`}
                    className={`group flex min-w-0 max-w-full items-baseline gap-2 rounded-sm py-1 text-left text-[13px] text-foreground/90 transition-colors duration-150 hover:text-foreground ${focus}`}
                  >
                    <span className="min-w-0 truncate underline-offset-4 group-hover:underline">{lang.label}</span>
                    <span className="font-mono text-[11px] text-faint">{lang.extension}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className={`mt-2 rounded-sm text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${focus}`}
            >
              {showAll ? "Show fewer languages" : `Show all ${languages.length} languages`}
            </button>
          </section>
        )}

        <dl className="mt-8 grid w-fit grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13px]">
          <dt className="font-mono text-[11px] leading-5 text-faint">{shortcutFor("new-file")}</dt>
          <dd className="text-muted-foreground">
            <button type="button" onClick={onNewFile} className={`rounded-sm hover:text-foreground ${focus}`}>
              New file
            </button>
          </dd>
          <dt className="font-mono text-[11px] leading-5 text-faint">{shortcutFor("new-project")}</dt>
          <dd className="text-muted-foreground">
            <button type="button" onClick={onNewProject} className={`rounded-sm hover:text-foreground ${focus}`}>
              New project
            </button>
          </dd>
        </dl>
      </div>
    </div>
  );
};

export default EditorEmptyState;
