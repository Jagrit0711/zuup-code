// URL-based sharing utilities (no localStorage needed)

export interface SharedCode {
  fileName: string;
  code: string;
  language: string;
}

export interface SharedProject {
  name: string;
  files: SharedCode[];
  mainFileName: string;
}

// Get the base URL for sharing (production or local)
function getBaseUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return window.location.origin;
  }
  return 'https://code.zuup.dev';
}

// Encode data to base64 URL-safe string
function encodeData(data: any): string {
  const jsonString = JSON.stringify(data);
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Decode base64 URL-safe string to data
function decodeData(encoded: string): any {
  try {
    // Restore padding and characters
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const jsonString = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error decoding data:', error);
    return null;
  }
}

export function generateShareUrl(fileName: string, code: string, language: string): string {
  const shareData: SharedCode = { fileName, code, language };
  const encoded = encodeData(shareData);
  const baseUrl = getBaseUrl();
  return `${baseUrl}/s/${encoded}`;
}

export function generateProjectUrl(name: string, files: Array<{fileName: string, code: string, language: string}>, mainFileName?: string): string {
  const projectData: SharedProject = {
    name,
    files: files.map(f => ({ fileName: f.fileName, code: f.code, language: f.language })),
    mainFileName: mainFileName || files[0]?.fileName || ''
  };
  const encoded = encodeData(projectData);
  const baseUrl = getBaseUrl();
  return `${baseUrl}/p/${encoded}`;
}

export function loadSharedCode(): SharedCode | null {
  const path = window.location.pathname;
  console.log('Debug: Current pathname:', path);
  
  // Handle /s/encoded format for single files
  const shareMatch = path.match(/^\/s\/([A-Za-z0-9\-_]+)$/);
  if (shareMatch) {
    console.log('Debug: Found encoded share data:', shareMatch[1]);
    const decoded = decodeData(shareMatch[1]);
    return decoded;
  }
  
  return null;
}

export function loadSharedProject(): SharedProject | null {
  const path = window.location.pathname;
  console.log('Debug: Current pathname:', path);
  
  // Handle /p/encoded format for projects
  const projectMatch = path.match(/^\/p\/([A-Za-z0-9\-_]+)$/);
  if (projectMatch) {
    console.log('Debug: Found encoded project data:', projectMatch[1]);
    const decoded = decodeData(projectMatch[1]);
    return decoded;
  }
  
  return null;
}

export function getShareIdFromUrl(): string | null {
  // Legacy support - no longer needed with URL encoding
  return null;
}

export function getProjectIdFromUrl(): string | null {
  // Legacy support - no longer needed with URL encoding
  return null;
}

export function clearUrlParams(): void {
  // Navigate to root path
  window.history.replaceState({}, '', '/');
}