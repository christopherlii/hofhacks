import { registerAppIpcHandlers } from './register';

import type { ScamResult, Settings } from '../../types';

interface CreateIpcRegistrationDeps {
  getSettingsPayload: () => Settings;
  saveSettingsPayload: (settings: Partial<Settings>) => boolean;
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
}

function createIpcRegistration(deps: CreateIpcRegistrationDeps) {
  let ipcRegistered = false;

  function registerIpcHandlers(): void {
    if (ipcRegistered) return;

    registerAppIpcHandlers({
      getSettings: deps.getSettingsPayload,
      saveSettings: deps.saveSettingsPayload,
      getApiKey: deps.getApiKey,
      handleChatQuery: deps.handleChatQuery,
      getActivityStats: deps.getActivityStats,
      exportMarkdown: deps.exportMarkdown,
      flushNow: deps.flushNow,
      detectPatternsNow: deps.detectPatternsNow,
      searchNia: deps.searchNia,
      listNiaContexts: deps.listNiaContexts,
      getSessionStats: deps.getSessionStats,
      getEntityGraph: deps.getEntityGraph,
      getNodeDetail: deps.getNodeDetail,
      getEdgeDetail: deps.getEdgeDetail,
      previewGraphGroup: deps.previewGraphGroup,
      getUnderstandingPreview: deps.getUnderstandingPreview,
      analyzeGraphGroup: deps.analyzeGraphGroup,
      getLocalKnowledge: deps.getLocalKnowledge,
      openSettings: deps.openSettings,
      openChat: deps.openChat,
      updateStatus: deps.updateStatus,
      showAlert: deps.showAlert,
      dismissAlert: deps.dismissAlert,
      onOverlayMouseEnter: deps.onOverlayMouseEnter,
      onOverlayMouseLeave: deps.onOverlayMouseLeave,
      resizeOverlay: deps.resizeOverlay,
    });

    ipcRegistered = true;
  }

  return { registerIpcHandlers };
}

export { createIpcRegistration };
