import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/components/ide/settings/ModalShell";
import { Select } from "@/components/ide/settings/controls";
import { buttonClass, inputClass } from "@/components/ide/settings/styles";
import { getLanguageById, getLanguagesByGroup } from "@/lib/languages";
import { readTextFiles } from "@/lib/fileSystem";
import { cn } from "@/lib/utils";

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

function formatSize(chars: number): string {
  return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(1)} KB`;
}

const NewProjectModal = ({ isOpen, onClose, onCreateProject, defaultLanguage = "python" }: NewProjectModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [source, setSource] = useState<Source>("blank");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; content: string }[]>([]);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), nameError: useId(), desc: useId(), lang: useId(), source: useId() };

  // Start each opening from a clean form with the caller's preferred language.
  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setLanguage(defaultLanguage);
    setSource("blank");
    setUploadedFiles([]);
    setTriedSubmit(false);
  }, [isOpen, defaultLanguage]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const { files, skipped } = await readTextFiles(list);
    if (skipped.length > 0) {
      toast.error(`Skipped ${skipped.length} file${skipped.length > 1 ? "s" : ""}`, {
        description: "Only text files up to 1 MB can be added.",
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

  const nameMissing = name.trim().length === 0;
  const filesMissing = source === "upload" && uploadedFiles.length === 0;
  const selectedLang = getLanguageById(language);

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTriedSubmit(true);
    if (nameMissing) {
      nameInputRef.current?.focus();
      return;
    }
    if (filesMissing) return;
    onCreateProject({
      name: name.trim(),
      description: description.trim(),
      language,
      uploadedFiles: source === "upload" ? uploadedFiles : [],
    });
    onClose();
  };

  const languageOptions = getLanguagesByGroup().flatMap((g) => g.languages.map((l) => ({ value: l.id, label: l.label })));

  const radio = (value: Source, label: string, hint: React.ReactNode) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 border-b border-rule py-3 last:border-b-0",
      )}
    >
      <input
        type="radio"
        name={ids.source}
        value={value}
        checked={source === value}
        onChange={() => setSource(value)}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="New project"
      description="Replaces what is open now. Signed-in projects are saved to your account."
      className="max-w-[32rem]"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        nameInputRef.current?.focus();
      }}
    >
      <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
          <div>
            <label htmlFor={ids.name} className="mb-1.5 block text-[13px] font-medium text-foreground">
              Name
            </label>
            <input
              id={ids.name}
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weather station"
              maxLength={80}
              autoComplete="off"
              aria-invalid={triedSubmit && nameMissing}
              aria-describedby={triedSubmit && nameMissing ? ids.nameError : undefined}
              className={cn(inputClass, "h-9", triedSubmit && nameMissing && "border-danger/60")}
            />
            {triedSubmit && nameMissing ? (
              <p id={ids.nameError} className="mt-1.5 text-[12px] text-danger">
                Give the project a name.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={ids.desc} className="mb-1.5 block text-[13px] font-medium text-foreground">
              Description <span className="font-normal text-faint">optional</span>
            </label>
            <textarea
              id={ids.desc}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it does, or which class it is for"
              rows={2}
              maxLength={500}
              className={cn(inputClass, "h-auto resize-none py-2 leading-relaxed")}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label htmlFor={ids.lang} className="text-[13px] font-medium text-foreground">
              Language
            </label>
            <Select<string> id={ids.lang} value={language} options={languageOptions} onChange={setLanguage} className="w-52" />
          </div>

          <fieldset>
            <legend className="mb-1 text-[13px] font-medium text-foreground">Start with</legend>
            <div className="border-t border-rule">
              {radio(
                "blank",
                "An empty file",
                <>
                  One blank <span className="font-mono text-[11px] text-foreground/80">main{selectedLang.extension}</span>, nothing pre-filled.
                </>,
              )}
              {radio("upload", "Files from your computer", "Text files up to 1 MB each. The language is taken from each file name.")}
            </div>
          </fieldset>

          {source === "upload" ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                accept={ACCEPTED_EXTENSIONS}
                tabIndex={-1}
                aria-hidden="true"
              />
              <div className="flex items-center justify-between gap-3">
                <span className={cn("text-[12px]", triedSubmit && filesMissing ? "text-danger" : "text-muted-foreground")}>
                  {uploadedFiles.length === 0
                    ? "No files chosen yet."
                    : `${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""} chosen`}
                </span>
                <button type="button" className={buttonClass.secondary} onClick={() => fileInputRef.current?.click()}>
                  {uploadedFiles.length === 0 ? "Choose files" : "Add more files"}
                </button>
              </div>
              {uploadedFiles.length > 0 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-rule bg-ink">
                  {uploadedFiles.map((f) => (
                    <li key={f.name} className="flex h-8 items-center gap-3 border-b border-rule px-2.5 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{f.name}</span>
                      <span className="shrink-0 text-[12px] tabular-nums text-faint">{formatSize(f.content.length)}</span>
                      <button
                        type="button"
                        onClick={() => setUploadedFiles((prev) => prev.filter((x) => x.name !== f.name))}
                        aria-label={`Remove ${f.name}`}
                        className="shrink-0 rounded px-1 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-rule px-6 py-3">
          <button type="button" onClick={onClose} className={buttonClass.quiet}>
            Cancel
          </button>
          <button type="submit" className={buttonClass.primary}>
            Create project
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

export default NewProjectModal;
