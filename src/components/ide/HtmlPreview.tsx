import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

interface HtmlPreviewProps {
  code: string;
}

const EMPTY_DOCUMENT =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,sans-serif;color:#6b7280;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head><body><p>Nothing to preview yet. Start writing HTML.</p></body></html>';

/** Delay before the preview reloads, so typing doesn't restart the page on every keystroke. */
const PREVIEW_DEBOUNCE_MS = 250;

const HtmlPreview = ({ code }: HtmlPreviewProps) => {
  const [renderedCode, setRenderedCode] = useState(code);

  useEffect(() => {
    const timer = setTimeout(() => setRenderedCode(code), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
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
        {/*
          Scripts may run, but the frame is NOT same-origin with the editor (no allow-same-origin),
          so previewed or shared code cannot read the editor's storage or session.
        */}
        <iframe
          title="HTML Preview"
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-forms allow-modals"
          srcDoc={renderedCode.trim() ? renderedCode : EMPTY_DOCUMENT}
        />
      </div>
    </div>
  );
};

export default HtmlPreview;
