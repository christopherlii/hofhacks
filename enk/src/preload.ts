import { contextBridge, ipcRenderer } from 'electron';

export interface EnkSettings {
  anthropicKey: string;
  niaKey: string;
  geminiKey?: string;
  enabled: boolean;
  scamDetection: boolean;
  useVisionExtraction?: boolean;
  firstLaunch: boolean;
  apiKey?: string;
  guardianEnabled?: boolean;
  elephantEnabled?: boolean;
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

export interface SettingsPayload extends Partial<EnkSettings> {
  apiKey?: string;
  guardianEnabled?: boolean;
  elephantEnabled?: boolean;
}

contextBridge.exposeInMainWorld('enk', {
  // Settings
  getSettings: (): Promise<EnkSettings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: SettingsPayload): Promise<boolean> => ipcRenderer.invoke('save-settings', settings),
  getApiKey: (): Promise<string> => ipcRenderer.invoke('get-api-key'),
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
  pruneGraphNoise: (): Promise<{ nodesRemoved: number; edgesRemoved: number }> => ipcRenderer.invoke('prune-graph-noise'),
  resetGraph: (): Promise<void> => ipcRenderer.invoke('reset-graph'),
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
  updateStatus: (status: string): void => ipcRenderer.send('update-status', status),
  showAlert: (data: unknown): void => ipcRenderer.send('show-alert', data),
  dismissAlert: (): void => ipcRenderer.send('dismiss-alert'),
  resizeOverlay: (height: number): void => ipcRenderer.send('resize-overlay', height),
  overlayMouseEnter: (): void => ipcRenderer.send('overlay-mouse-enter'),
  overlayMouseLeave: (): void => ipcRenderer.send('overlay-mouse-leave'),

  // === User Model API ===
  // Primary interface for apps consuming context
  
  /** Get complete user model - who they work with, what they're working on, expertise, patterns */
  getUserModel: (): Promise<any> => ipcRenderer.invoke('get-user-model'),
  
  /** Get current context - what's happening right now */
  getCurrentContext: (): Promise<any> => ipcRenderer.invoke('get-current-context'),
  
  /** Get top people the user interacts with */
  getTopPeople: (limit?: number): Promise<any[]> => ipcRenderer.invoke('get-top-people', limit),
  
  /** Get active projects */
  getActiveProjects: (limit?: number): Promise<any[]> => ipcRenderer.invoke('get-active-projects', limit),
  
  /** Get user's expertise (skills, tools) */
  getExpertise: (limit?: number): Promise<any[]> => ipcRenderer.invoke('get-expertise', limit),
  
  /** Get task blocks - activity grouped into coherent work sessions */
  getTaskBlocks: (limit?: number): Promise<any[]> => ipcRenderer.invoke('get-task-blocks', limit),
  
  /** Get timeline of tasks for a date range */
  getTimeline: (fromMs: number, toMs: number): Promise<any[]> => ipcRenderer.invoke('get-timeline', fromMs, toMs),
  
  /** Find entities related to a given entity */
  getRelatedEntities: (entityId: string, limit?: number): Promise<any[]> => 
    ipcRenderer.invoke('get-related-entities', entityId, limit),
  
  /** Search entities by query */
  searchEntities: (query: string, limit?: number): Promise<any[]> => 
    ipcRenderer.invoke('search-entities', query, limit),
  
  /** Get a summary of the user's day */
  getDaySummary: (dateMs?: number): Promise<any> => ipcRenderer.invoke('get-day-summary', dateMs),

  // Elephant overlay IPC (used by the modular/stashed UI flow)
  elephantDismiss: (): void => ipcRenderer.send('elephant-dismiss'),
  elephantFollowUp: (question: string): void => ipcRenderer.send('elephant-follow-up', question),
  elephantFocusInput: (): void => ipcRenderer.send('elephant-focus-input'),
  elephantBlurInput: (): void => ipcRenderer.send('elephant-blur-input'),
  elephantFeedback: (itemId: string, isPositive: boolean): void =>
    ipcRenderer.send('elephant-feedback', { itemId, isPositive }),
  elephantClearMemory: (): Promise<boolean> => ipcRenderer.invoke('elephant-clear-memory'),
  elephantRunSuggestion: (suggestionId: string): Promise<any> =>
    ipcRenderer.invoke('elephant-run-suggestion', suggestionId),
  onElephantResponse: (callback: (data: unknown) => void): void => {
    ipcRenderer.on('elephant-response', (_event, data: unknown) => callback(data));
  },
  onElephantError: (callback: (message: string) => void): void => {
    ipcRenderer.on('elephant-error', (_event, message: string) => callback(message));
  },
  onElephantLoading: (callback: () => void): void => {
    ipcRenderer.on('elephant-loading', () => callback());
  },
  onElephantTextResult: (callback: (data: { suggestion_id: string; label: string; text: string }) => void): void => {
    ipcRenderer.on('elephant-text-result', (_event, data) => callback(data));
  },
});
