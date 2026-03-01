import { useEffect, useRef } from "react";
import { Eye } from "lucide-react";

interface HtmlPreviewProps {
  code: string;
}

const HtmlPreview = ({ code }: HtmlPreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        try {
          doc.open();
          doc.write(code || '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><p>No content to preview</p></body></html>');
          doc.close();
        } catch (error) {
          console.error('Failed to write to iframe:', error);
        }
      }
    }
  }, [code]);

  return (
    <div className="flex h-full flex-col glass">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Eye size={12} className="text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </span>
      </div>
      <div className="flex-1 bg-white">
        <iframe
          ref={iframeRef}
          title="HTML Preview"
          className="h-full w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms"
          srcDoc={code || '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><p>No content to preview</p></body></html>'}
        />
      </div>
    </div>
  );
};

export default HtmlPreview;
