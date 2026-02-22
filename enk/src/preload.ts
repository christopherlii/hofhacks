import { contextBridge, ipcRenderer } from 'electron';

export interface EnkSettings {
  anthropicKey: string;
  niaKey: string;
  enabled: boolean;
  scamDetection: boolean;
  firstLaunch: boolean;
}

export interface ChatResult {
  response?: string;
  error?: string;
}

export interface ActivityStats {
  apps: { app: string; minutes: number; seconds: number }[];
  totalSwitches: number;
  recentActivity: {
    app: string;
    title: string;
    url: string | null;
    start: number;
    duration: number;
    summary: string | null;
  }[];
}

export interface ExportResult {
  content?: string;
  filename?: string;
  error?: string;
}

contextBridge.exposeInMainWorld('enk', {
  // Settings
  getSettings: (): Promise<EnkSettings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<EnkSettings>): Promise<boolean> => ipcRenderer.invoke('save-settings', settings),
  openSettings: (): void => ipcRenderer.send('open-settings'),

  // Chat
  chatQuery: (query: string): Promise<ChatResult> => ipcRenderer.invoke('chat-query', query),
  openChat: (): void => ipcRenderer.send('open-chat'),

  // Activity
  getActivityStats: (): Promise<ActivityStats> => ipcRenderer.invoke('get-activity-stats'),
  flushNow: (): Promise<boolean> => ipcRenderer.invoke('flush-now'),
  detectPatternsNow: (): Promise<void> => ipcRenderer.invoke('detect-patterns-now'),

  // Search & Export
  searchNia: (query: string): Promise<any[]> => ipcRenderer.invoke('search-nia', query),
  listNiaContexts: (opts?: { tags?: string; limit?: number }): Promise<any[]> => ipcRenderer.invoke('list-nia-contexts', opts),
  exportMd: (type: string, date?: string): Promise<ExportResult> => ipcRenderer.invoke('export-md', type, date),
  getSessionStats: (): Promise<any> => ipcRenderer.invoke('get-session-stats'),
  getEntityGraph: (): Promise<any> => ipcRenderer.invoke('get-entity-graph'),
  getNodeDetail: (nodeId: string): Promise<any> => ipcRenderer.invoke('get-node-detail', nodeId),
  getEdgeDetail: (sourceId: string, targetId: string): Promise<any> => ipcRenderer.invoke('get-edge-detail', sourceId, targetId),
  previewGraphGroup: (nodeIds: string[]): Promise<{ preview?: string }> => ipcRenderer.invoke('preview-graph-group', nodeIds),
  getUnderstandingPreview: (): Promise<any> => ipcRenderer.invoke('get-understanding-preview'),
  analyzeGraphGroup: (nodeIds: string[]): Promise<any> => ipcRenderer.invoke('analyze-graph-group', nodeIds),
  getLocalKnowledge: (): Promise<string> => ipcRenderer.invoke('get-local-knowledge'),

  // Status & Alerts (indicator/overlay)
  onStatusUpdate: (callback: (status: string) => void): void => {
    ipcRenderer.on('status-update', (_, status) => callback(status));
  },
  onShowAlert: (callback: (data: any) => void): void => {
    ipcRenderer.on('show-alert', (_, data) => callback(data));
  },
  onHideAlert: (callback: () => void): void => {
    ipcRenderer.on('hide-alert', () => callback());
  },
  resizeOverlay: (height: number): void => ipcRenderer.send('resize-overlay', height),
  overlayMouseEnter: (): void => ipcRenderer.send('overlay-mouse-enter'),
  overlayMouseLeave: (): void => ipcRenderer.send('overlay-mouse-leave'),
});
