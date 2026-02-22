import { ipcMain } from 'electron';

import type { 
  ScamResult, 
  Settings, 
  UserModel, 
  CurrentContext, 
  PersonEntity, 
  ProjectEntity, 
  SkillEntity,
  TaskBlock,
} from '../../types';

interface AppIpcDeps {
  getSettings: () => Settings;
  saveSettings: (settings: Partial<Settings>) => boolean;
  getApiKey: () => string;
  handleChatQuery: (query: string) => Promise<{ response?: string; error?: string }>;
  getActivityStats: () => unknown;
  exportMarkdown: (type: string, date?: string) => Promise<{ content?: string; filename?: string; error?: string }>;
  flushNow: () => Promise<void>;
  detectPatternsNow: () => Promise<void>;
  searchNia: (query: string) => Promise<unknown[]>;
  listNiaContexts: (opts?: { tags?: string; limit?: number }) => Promise<unknown[]>;
  getSessionStats: () => unknown;
  getEntityGraph: () => unknown;
  getNodeDetail: (nodeId: string) => unknown;
  getEdgeDetail: (sourceId: string, targetId: string) => unknown;
  pruneGraphNoise: () => Promise<{ nodesRemoved: number; edgesRemoved: number }>;
  resetGraph: () => void;
  previewGraphGroup: (nodeIds: string[]) => Promise<{ preview?: string }>;
  getUnderstandingPreview: () => unknown;
  analyzeGraphGroup: (nodeIds: string[]) => Promise<unknown>;
  getLocalKnowledge: () => string;
  openSettings: () => void;
  openChat: () => void;
  updateStatus: (status: string) => void;
  showAlert: (data: ScamResult) => void;
  dismissAlert: () => void;
  onOverlayMouseEnter: () => void;
  onOverlayMouseLeave: () => void;
  resizeOverlay: (height: number) => void;
  
  // User Model API
  getUserModel: () => UserModel;
  getCurrentContext: () => CurrentContext;
  getTopPeople: (limit?: number) => PersonEntity[];
  getActiveProjects: (limit?: number) => ProjectEntity[];
  getExpertise: (limit?: number) => SkillEntity[];
  getTaskBlocks: (limit?: number) => TaskBlock[];
  getTimeline: (fromMs: number, toMs: number) => TaskBlock[];
  getRelatedEntities: (entityId: string, limit?: number) => unknown[];
  searchEntities: (query: string, limit?: number) => unknown[];
  getDaySummary: (dateMs?: number) => unknown;
}

function registerAppIpcHandlers(deps: AppIpcDeps): void {
  ipcMain.handle('get-settings', () => deps.getSettings());
  ipcMain.handle('save-settings', (_event, settings: Partial<Settings>) => deps.saveSettings(settings));
  ipcMain.handle('get-api-key', () => deps.getApiKey());

  ipcMain.handle('chat-query', async (_event, query: string) => deps.handleChatQuery(query));
  ipcMain.handle('get-activity-stats', () => deps.getActivityStats());
  ipcMain.handle('export-md', async (_event, type: string, date?: string) => deps.exportMarkdown(type, date));
  ipcMain.handle('flush-now', async () => {
    await deps.flushNow();
    return true;
  });
  ipcMain.handle('detect-patterns-now', async () => {
    await deps.detectPatternsNow();
  });
  ipcMain.handle('search-nia', async (_event, query: string) => deps.searchNia(query));
  ipcMain.handle('list-nia-contexts', async (_event, opts?: { tags?: string; limit?: number }) =>
    deps.listNiaContexts(opts)
  );

  ipcMain.handle('get-session-stats', () => deps.getSessionStats());
  ipcMain.handle('get-entity-graph', () => deps.getEntityGraph());
  ipcMain.handle('get-node-detail', (_event, nodeId: string) => deps.getNodeDetail(nodeId));
  ipcMain.handle('get-edge-detail', (_event, sourceId: string, targetId: string) => deps.getEdgeDetail(sourceId, targetId));
  ipcMain.handle('prune-graph-noise', async () => deps.pruneGraphNoise());
  ipcMain.handle('reset-graph', () => deps.resetGraph());
  ipcMain.handle('preview-graph-group', async (_event, nodeIds: string[]) => deps.previewGraphGroup(nodeIds));
  ipcMain.handle('get-understanding-preview', () => deps.getUnderstandingPreview());
  ipcMain.handle('analyze-graph-group', async (_event, nodeIds: string[]) => deps.analyzeGraphGroup(nodeIds));
  ipcMain.handle('get-local-knowledge', () => deps.getLocalKnowledge());

  // === User Model API ===
  // Primary interface for apps consuming context
  
  ipcMain.handle('get-user-model', () => deps.getUserModel());
  ipcMain.handle('get-current-context', () => deps.getCurrentContext());
  ipcMain.handle('get-top-people', (_event, limit?: number) => deps.getTopPeople(limit));
  ipcMain.handle('get-active-projects', (_event, limit?: number) => deps.getActiveProjects(limit));
  ipcMain.handle('get-expertise', (_event, limit?: number) => deps.getExpertise(limit));
  ipcMain.handle('get-task-blocks', (_event, limit?: number) => deps.getTaskBlocks(limit));
  ipcMain.handle('get-timeline', (_event, fromMs: number, toMs: number) => deps.getTimeline(fromMs, toMs));
  ipcMain.handle('get-related-entities', (_event, entityId: string, limit?: number) => 
    deps.getRelatedEntities(entityId, limit));
  ipcMain.handle('search-entities', (_event, query: string, limit?: number) => 
    deps.searchEntities(query, limit));
  ipcMain.handle('get-day-summary', (_event, dateMs?: number) => deps.getDaySummary(dateMs));

  ipcMain.on('open-settings', () => deps.openSettings());
  ipcMain.on('open-chat', () => deps.openChat());
  ipcMain.on('update-status', (_event, status: string) => deps.updateStatus(status));
  ipcMain.on('show-alert', (_event, data: ScamResult) => deps.showAlert(data));
  ipcMain.on('dismiss-alert', () => deps.dismissAlert());
  ipcMain.on('overlay-mouse-enter', () => deps.onOverlayMouseEnter());
  ipcMain.on('overlay-mouse-leave', () => deps.onOverlayMouseLeave());
  ipcMain.on('resize-overlay', (_event, height: number) => deps.resizeOverlay(height));
}

export { registerAppIpcHandlers };
