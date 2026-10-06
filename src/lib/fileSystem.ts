export interface FileTab {
  id: string;
  name: string;
  languageId: string;
  content: string;
  isDirty: boolean;
}

let nextId = 1;

export function createFile(name: string, languageId: string, content: string): FileTab {
  return {
    id: `file_${nextId++}_${Date.now()}`,
    name,
    languageId,
    content,
    isDirty: false,
  };
}

/** Largest text file the editor will import. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

export interface ReadTextFilesResult {
  files: { name: string; content: string }[];
  /** Names of files that were left out (too large, binary or unreadable). */
  skipped: string[];
}

/** Reads user selected files as text, skipping oversized, binary or unreadable ones. */
export async function readTextFiles(
  list: FileList | File[],
  maxBytes: number = MAX_UPLOAD_BYTES
): Promise<ReadTextFilesResult> {
  const result: ReadTextFilesResult = { files: [], skipped: [] };
  for (const file of Array.from(list)) {
    if (file.size > maxBytes) {
      result.skipped.push(file.name);
      continue;
    }
    try {
      const content = await file.text();
      if (content.includes("\u0000")) {
        result.skipped.push(file.name);
        continue;
      }
      result.files.push({ name: file.name, content });
    } catch {
      result.skipped.push(file.name);
    }
  }
  return result;
}

export function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function shareFile(name: string, content: string) {
  if (navigator.share) {
    navigator.share({
      title: `Zuup Code — ${name}`,
      text: content,
    }).catch(() => {
      copyToClipboard(content);
    });
  } else {
    copyToClipboard(content);
  }
}

export function copyToClipboard(text: string): Promise<void> {
  // Check if clipboard API is available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  
  // Fallback for browsers/contexts without clipboard API
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      
      // Select and copy the text
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        resolve();
      } else {
        reject(new Error('Failed to copy text'));
      }
    } catch (error) {
      reject(error);
    }
  });
}
