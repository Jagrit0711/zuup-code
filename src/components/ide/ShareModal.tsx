import { useEffect, useId, useRef, useState } from "react";
import ModalShell from "@/components/ide/settings/ModalShell";
import { Segmented } from "@/components/ide/settings/controls";
import { buttonClass, inputClass } from "@/components/ide/settings/styles";
import { copyToClipboard } from "@/lib/fileSystem";
import { getLanguageById } from "@/lib/languages";
import { createFileShare, createProjectShare } from "@/lib/shareStorage";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  code: string;
  language: string;
  projectName?: string | null;
  allFiles?: Array<{ fileName: string; code: string; language: string }>;
}

type ShareType = "file" | "project";
type Copied = "code" | "link" | null;

function formatSize(chars: number): string {
  return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(1)} KB`;
}

const ShareModal = ({ isOpen, onClose, fileName, code, language, projectName, allFiles }: ShareModalProps) => {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState<Copied>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareType, setShareType] = useState<ShareType>("file");
  const [error, setError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const typeLabelId = useId();
  const linkId = useId();

  const fileCount = allFiles?.length ?? 0;
  const hasMultipleFiles = fileCount > 1;
  const effectiveType: ShareType = hasMultipleFiles ? shareType : "file";

  // Reset when the dialog opens; a request still in flight from an earlier opening is ignored.
  useEffect(() => {
    if (!isOpen) return;
    requestId.current++;
    setShareUrl("");
    setCopied(null);
    setError(null);
    setIsSharing(false);
  }, [isOpen]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const flashCopied = (what: Copied) => {
    setCopied(what);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const changeType = (type: ShareType) => {
    setShareType(type);
    setShareUrl("");
    setError(null);
  };

  const handleCreateShare = async () => {
    const id = ++requestId.current;
    setIsSharing(true);
    setError(null);
    try {
      let url: string | null = null;
      if (effectiveType === "file") {
        url = (await createFileShare(fileName, code, language))?.url ?? null;
      } else if (allFiles && allFiles.length > 0) {
        const title = projectName || `${fileName} project`;
        const shareFiles = allFiles.map((f) => ({ name: f.fileName, language: f.language, content: f.code }));
        url = (await createProjectShare(title, shareFiles, language))?.url ?? null;
      }
      if (id !== requestId.current) return;
      if (url) setShareUrl(url);
      else setError("Could not create the link. Check your connection and try again.");
    } catch (err) {
      console.error("Share error:", err);
      if (id === requestId.current) setError("Could not create the link. Check your connection and try again.");
    } finally {
      if (id === requestId.current) setIsSharing(false);
    }
  };

  // Select the link when it appears so Ctrl/Cmd+C works straight away.
  useEffect(() => {
    if (shareUrl) linkInputRef.current?.select();
  }, [shareUrl]);

  const projectSize = allFiles?.reduce((s, f) => s + f.code.length, 0) ?? 0;
  const details: [string, React.ReactNode][] =
    effectiveType === "file"
      ? [
          ["File", <span className="font-mono text-[12px]">{fileName}</span>],
          ["Language", getLanguageById(language).label],
          ["Size", formatSize(code.length)],
        ]
      : [
          ["Project", projectName || `${fileName} project`],
          ["Files", String(fileCount)],
          ["Size", formatSize(projectSize)],
        ];

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Share"
      description="Anyone with the link can read and copy the code. Nobody else can change it."
      className="max-w-[30rem]"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        primaryRef.current?.focus();
      }}
    >
      <div className="space-y-4 px-6 pb-5">
        {hasMultipleFiles && !shareUrl ? (
          <div className="flex items-center justify-between gap-4">
            <span id={typeLabelId} className="text-[13px] font-medium text-foreground">
              Share
            </span>
            <Segmented
              labelledBy={typeLabelId}
              value={effectiveType}
              options={[
                { value: "file", label: "This file" },
                { value: "project", label: `Whole project, ${fileCount} files` },
              ]}
              onChange={changeType}
            />
          </div>
        ) : null}

        {!shareUrl ? (
          <dl className="border-y border-rule">
            {details.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0">
                <dt className="text-[13px] text-muted-foreground">{k}</dt>
                <dd className="min-w-0 truncate text-[13px] text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor={linkId} className="text-[13px] font-medium text-foreground">
                Link
              </label>
              <span className="text-[12px] text-success" role="status">
                Link created
              </span>
            </div>
            <div className="flex gap-2">
              <input
                id={linkId}
                ref={linkInputRef}
                type="text"
                value={shareUrl}
                readOnly
                onFocus={(e) => e.target.select()}
                className={cn(inputClass, "font-mono text-[12px]")}
              />
              <button
                type="button"
                className={cn(buttonClass.primary, "w-24 shrink-0")}
                onClick={async () => {
                  await copyToClipboard(shareUrl);
                  flashCopied("link");
                }}
              >
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-rule px-6 py-3">
        {!shareUrl ? (
          <>
            <button
              type="button"
              className={buttonClass.quiet}
              onClick={async () => {
                await copyToClipboard(code);
                flashCopied("code");
              }}
            >
              {copied === "code" ? "Code copied" : "Copy code instead"}
            </button>
            <button ref={primaryRef} type="button" className={buttonClass.primary} onClick={handleCreateShare} disabled={isSharing}>
              {isSharing ? "Creating link…" : "Create link"}
            </button>
          </>
        ) : (
          <>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className={buttonClass.quiet}>
              Open link in a new tab
            </a>
            <button type="button" className={buttonClass.secondary} onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
};

export default ShareModal;
