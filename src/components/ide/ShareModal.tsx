import { useState, useEffect } from "react";
import { X, Copy, Check, Share2, FolderPlus, File } from "lucide-react";
import { copyToClipboard } from "@/lib/fileSystem";
import { generateShareUrl, generateProjectUrl, saveSharedCode, saveSharedProject } from "@/lib/sharing";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  code: string;
  language: string;
  allFiles?: Array<{fileName: string, code: string, language: string}>;
}

const ShareModal = ({ isOpen, onClose, fileName, code, language, allFiles }: ShareModalProps) => {
  const [shareUrl, setShareUrl] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareType, setShareType] = useState<"file" | "project">("file");

  useEffect(() => {
    if (isOpen && code) {
      generateShareLink();
    }
  }, [isOpen, code, fileName, language, shareType, allFiles]);

  const generateShareLink = () => {
    setIsSharing(true);
    
    if (shareType === "file") {
      // Generate single file share
      const shareId = saveSharedCode(fileName, code, language);
      const url = generateShareUrl(shareId);
      setShareUrl(url);
    } else {
      // Generate project share
      if (allFiles && allFiles.length > 0) {
        const projectId = saveSharedProject(`${fileName}-project`, allFiles, fileName);
        const url = generateProjectUrl(projectId);
        setProjectUrl(url);
      }
    }
    
    setIsSharing(false);
  };

  const handleCopyUrl = async () => {
    const urlToCopy = shareType === "file" ? shareUrl : projectUrl;
    await copyToClipboard(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const currentUrl = shareType === "file" ? shareUrl : projectUrl;
  const hasMultipleFiles = allFiles && allFiles.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Share2 size={16} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Share Your Code</h2>
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
              onClick={() => setShareType("file")}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${ 
                shareType === "file" 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <File size={14} />
              Current File
            </button>
            <button
              onClick={() => setShareType("project")}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${ 
                shareType === "project" 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderPlus size={14} />
              Entire Project ({allFiles?.length} files)
            </button>
          </div>
        )}

        {isSharing ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">
                {shareType === "file" ? "Generating share link..." : "Creating project share..."}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check size={16} className="text-green-500" />
                <span className="font-medium text-green-500">
                  {shareType === "file" ? "Code is ready to share!" : "Project is ready to share!"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {shareType === "file" 
                  ? `Your code "${fileName}" has been saved and is ready to share.`
                  : `Your project with ${allFiles?.length} files has been saved and is ready to share.`
                }
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {shareType === "file" ? "Share URL:" : "Project URL:"}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentUrl}
                  readOnly
                  className="flex-1 rounded border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground"
                />
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                URL format: <span className="font-mono text-primary">code.zuup.dev/{shareType === "project" ? "project/" : ""}{shareType === "file" ? "abc123" : "def456"}</span>
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCopyCode}
                className="flex-1 rounded border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80"
              >
                Copy Code
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
              >
                Done
              </button>
            </div>

            <div className="text-xs text-muted-foreground text-center pt-2">
              Share links work on both localhost and code.zuup.dev production site.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShareModal;