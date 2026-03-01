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
  return navigator.clipboard.writeText(text);
}
