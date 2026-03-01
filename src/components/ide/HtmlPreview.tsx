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
        doc.open();
        doc.write(code);
        doc.close();
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
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
};

export default HtmlPreview;
