import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import IconButton from "@/components/ide/chrome/IconButton";

interface HtmlPreviewProps {
  code: string;
}

const EMPTY_DOCUMENT =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Inter,system-ui,sans-serif;font-size:14px;color:#5C6170;margin:0;padding:24px}</style></head><body><p>Nothing to preview yet. Write some HTML and it appears here.</p></body></html>';

/** Delay before the preview reloads, so typing doesn't restart the page on every keystroke. */
const PREVIEW_DEBOUNCE_MS = 250;

const HtmlPreview = ({ code }: HtmlPreviewProps) => {
  const [renderedCode, setRenderedCode] = useState(code);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setRenderedCode(code), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [code]);

  return (
    <div className="flex h-full flex-col bg-ink">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-rule bg-panel pl-3 pr-1">
        <span className="text-[12px] font-semibold text-muted-foreground">Preview</span>
        <IconButton label="Reload preview" onClick={() => setReloadKey((k) => k + 1)} className="h-6 w-6">
          <RotateCw size={13} strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="flex-1 bg-white">
        {/*
          Scripts may run, but the frame is NOT same-origin with the editor (no allow-same-origin),
          so previewed or shared code cannot read the editor's storage or session.
        */}
        <iframe
          key={reloadKey}
          title="HTML preview"
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-forms allow-modals"
          srcDoc={renderedCode.trim() ? renderedCode : EMPTY_DOCUMENT}
        />
      </div>
    </div>
  );
};

export default HtmlPreview;
