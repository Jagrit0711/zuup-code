import { useState, useEffect } from "react";
import { X, Copy, Check, Share2, FolderPlus, File, Loader2, ExternalLink, Eye } from "lucide-react";
import { copyToClipboard } from "@/lib/fileSystem";
import { createFileShare, createProjectShare } from "@/lib/shareStorage";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  code: string;
  language: string;
  projectName?: string | null;
  allFiles?: Array<{fileName: string, code: string, language: string}>;
}

const ShareModal = ({ isOpen, onClose, fileName, code, language, projectName, allFiles }: ShareModalProps) => {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareType, setShareType] = useState<"file" | "project">("file");
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShareUrl("");
      setCopied(false);
      setError(null);
      setIsSharing(false);
    }
  }, [isOpen]);

  const handleCreateShare = async () => {
    setIsSharing(true);
    setError(null);
    try {
      if (shareType === "file") {
        const result = await createFileShare(fileName, code, language);
        if (result) {
          setShareUrl(result.url);
        } else {
          setError("Failed to create share link. Please try again.");
        }
      } else {
        if (allFiles && allFiles.length > 0) {
          const shareFiles = allFiles.map(f => ({
            name: f.fileName,
            language: f.language,
            content: f.code,
          }));
          const title = projectName || `${fileName} project`;
          const result = await createProjectShare(title, shareFiles, language);
          if (result) {
            setShareUrl(result.url);
          } else {
            setError("Failed to create project share. Please try again.");
          }
        }
      }
    } catch (err) {
      console.error("Share error:", err);
      setError("Something went wrong. Please try again.");
    }
    setIsSharing(false);
  };

  const handleCopyUrl = async () => {
    await copyToClipboard(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const hasMultipleFiles = allFiles && allFiles.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border glass-strong p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Share2 size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Share Your Code</h2>
              <p className="text-[11px] text-muted-foreground">Create a shareable link — viewers can see but not edit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Share Type Selection */}
        {hasMultipleFiles && (
          <div className="mb-4 flex gap-2 p-1 bg-secondary/50 rounded-lg">
            <button
              onClick={() => { setShareType("file"); setShareUrl(""); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${ 
                shareType === "file" 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <File size={14} />
              Current File
            </button>
            <button
              onClick={() => { setShareType("project"); setShareUrl(""); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${ 
                shareType === "project" 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderPlus size={14} />
              Project ({allFiles?.length} files)
            </button>
          </div>
        )}

        {/* Pre-share info */}
        {!shareUrl && !isSharing && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
              <div className="text-xs text-muted-foreground space-y-2">
                {shareType === "file" ? (
                  <>
                    <p><span className="font-medium text-foreground">File:</span> {fileName}</p>
                    <p><span className="font-medium text-foreground">Language:</span> {language}</p>
                    <p><span className="font-medium text-foreground">Size:</span> {(code.length / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <>
                    <p><span className="font-medium text-foreground">Project:</span> {projectName || `${fileName} project`}</p>
                    <p><span className="font-medium text-foreground">Files:</span> {allFiles?.length || 0}</p>
                    <p><span className="font-medium text-foreground">Total size:</span> {((allFiles?.reduce((s, f) => s + f.code.length, 0) || 0) / 1024).toFixed(1)} KB</p>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCopyCode}
                className="flex-1 rounded-lg border border-border/60 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                {copied ? "Copied!" : "Copy Code"}
              </button>
              <button
                onClick={handleCreateShare}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110 transition-all"
              >
                <Share2 size={14} />
                Create Share Link
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isSharing && (
          <div className="flex items-center justify-center py-10">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Creating share link...</span>
            </div>
          </div>
        )}

        {/* Share URL generated */}
        {shareUrl && !isSharing && (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Check size={16} className="text-green-500" />
                <span className="font-medium text-sm text-green-400">Share link created!</span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Eye size={11} />
                Anyone with this link can view your code (read-only)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Share URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-mono text-foreground"
                />
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110 transition-all"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Short link: <span className="font-mono text-primary">{shareUrl.replace(/^https?:\/\//, "")}</span>
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <ExternalLink size={14} />
                Open Link
              </a>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShareModal;