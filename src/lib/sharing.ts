// Sharing utilities for local code storage and sharing

export interface SharedCode {
  id: string;
  fileName: string;
  code: string;
  language: string;
  createdAt: string;
}

export interface SharedProject {
  id: string;
  name: string;
  files: SharedCode[];
  createdAt: string;
  mainFileId: string;
}

// Get the base URL for sharing (production or local)
function getBaseUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return window.location.origin;
  }
  return 'https://code.zuup.dev';
}

export function saveSharedCode(fileName: string, code: string, language: string): string {
  // Generate unique ID for this share
  const shareId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  // Create shared code object
  const sharedCode: SharedCode = {
    id: shareId,
    fileName,
    code,
    language,
    createdAt: new Date().toISOString(),
  };
  
  // Save to localStorage
  localStorage.setItem(`shared_${shareId}`, JSON.stringify(sharedCode));
  
  // Also maintain a list of all shared codes for potential cleanup
  const sharedList = getSharedCodesList();
  sharedList.push({
    id: shareId,
    fileName,
    createdAt: sharedCode.createdAt,
  });
  localStorage.setItem('shared_codes_list', JSON.stringify(sharedList));
  
  return shareId;
}

export function saveSharedProject(name: string, files: Array<{fileName: string, code: string, language: string}>, mainFileId?: string): string {
  // Generate unique ID for this project
  const projectId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  // Create shared codes for each file
  const sharedFiles: SharedCode[] = files.map((file, index) => ({
    id: `${projectId}_file_${index}`,
    fileName: file.fileName,
    code: file.code,
    language: file.language,
    createdAt: new Date().toISOString(),
  }));
  
  // Create shared project object
  const sharedProject: SharedProject = {
    id: projectId,
    name,
    files: sharedFiles,
    createdAt: new Date().toISOString(),
    mainFileId: mainFileId || sharedFiles[0]?.id || '',
  };
  
  // Save to localStorage
  localStorage.setItem(`project_${projectId}`, JSON.stringify(sharedProject));
  
  // Also maintain a list of all shared projects
  const projectList = getSharedProjectsList();
  projectList.push({
    id: projectId,
    name,
    createdAt: sharedProject.createdAt,
  });
  localStorage.setItem('shared_projects_list', JSON.stringify(projectList));
  
  return projectId;
}

export function loadSharedCode(shareId: string): SharedCode | null {
  try {
    const stored = localStorage.getItem(`shared_${shareId}`);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error loading shared code:', error);
    return null;
  }
}

export function loadSharedProject(projectId: string): SharedProject | null {
  try {
    const stored = localStorage.getItem(`project_${projectId}`);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error loading shared project:', error);
    return null;
  }
}

export function deleteSharedCode(shareId: string): void {
  localStorage.removeItem(`shared_${shareId}`);
  
  // Update the list
  const sharedList = getSharedCodesList().filter(item => item.id !== shareId);
  localStorage.setItem('shared_codes_list', JSON.stringify(sharedList));
}

export function deleteSharedProject(projectId: string): void {
  localStorage.removeItem(`project_${projectId}`);
  
  // Update the list
  const projectList = getSharedProjectsList().filter(item => item.id !== projectId);
  localStorage.setItem('shared_projects_list', JSON.stringify(projectList));
}

export function getSharedCodesList(): Array<{id: string, fileName: string, createdAt: string}> {
  try {
    const stored = localStorage.getItem('shared_codes_list');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

export function getSharedProjectsList(): Array<{id: string, name: string, createdAt: string}> {
  try {
    const stored = localStorage.getItem('shared_projects_list');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

export function generateShareUrl(shareId: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/${shareId}`;
}

export function generateProjectUrl(projectId: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/project/${projectId}`;
}

export function getShareIdFromUrl(): string | null {
  const path = window.location.pathname;
  // Handle /shareId format
  const match = path.match(/^\/([a-zA-Z0-9]+)$/);
  if (match) {
    return match[1];
  }
  // Fallback to query parameter for backwards compatibility
  const params = new URLSearchParams(window.location.search);
  return params.get('shared');
}

export function getProjectIdFromUrl(): string | null {
  const path = window.location.pathname;
  // Handle /project/projectId format
  const match = path.match(/^\/project\/([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

export function clearUrlParams(): void {
  // Navigate to root path
  window.history.replaceState({}, '', '/');
}