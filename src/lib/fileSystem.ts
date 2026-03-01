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
