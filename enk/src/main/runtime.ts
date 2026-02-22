import { app, globalShortcut, systemPreferences } from 'electron';

import { NiaClient } from '../nia-client';
import { LocalKnowledgeCache } from './knowledge/local-cache';
import { pollActiveWindow as pollActiveWindowFromModule, type ActiveWindowState } from './monitoring/activity';
import { LocalSignalsMonitor } from './monitoring/local-signals';
import { OcrEngine, ScreenChangeTracker } from './monitoring/screen-pipeline';
import {
  getApiKey as getStoreApiKey,
  getSettingsPayload as buildSettingsPayload,
  isElephantEnabled as isStoreElephantEnabled,
  saveSettingsPayload as persistSettingsPayload,
} from './platform/settings';
import { initConfigStore } from './platform/store';
import { AppWindows } from './platform/windows';
import type { ActivityEntry, ContentSnapshot, ScamResult, Settings } from '../types';
import * as elephant from '../modules/elephant';
import { createAssistantApi } from './assistant/api';
import { createClaudeApi } from './claude-api';
import { createFlushToNia } from './nia/flush';
import { createGraphApi } from './graph/api';
import { createInsightsApi } from './insights';
import { createIpcRegistration } from './ipc/setup';
import { createMonitoringControl } from './monitoring/control';
import { createMonitoringPipeline } from './monitoring/capture-loop';

let store: any;

const windows = new AppWindows();
const nia = new NiaClient('');
const ocrEngine = new OcrEngine();
const screenChangeTracker = new ScreenChangeTracker();

let currentWindow: ActiveWindowState = {
  app: '',
  title: '',
  url: '',
  since: Date.now(),
};

const activityLog: ActivityEntry[] = [];
let loadedActivity: ActivityEntry[] = [];
const contentSnapshots: ContentSnapshot[] = [];
let loadedSnapshots: ContentSnapshot[] = [];
const pendingSummaries: ContentSnapshot[] = [];
const previousTexts: Record<string, string> = {};

const MIN_DURATION_MS = 3000;
const PERSISTED_ACTIVITY_MAX = 150;
const PERSISTED_SNAPSHOTS_MAX = 40;

const claudeApi = createClaudeApi(() => store);
const localKnowledgeCache = new LocalKnowledgeCache({
  getStore: () => store,
  nia,
  claudeRequest: claudeApi.claudeRequest,
});

let localSignals: LocalSignalsMonitor;

function getAllActivity(): ActivityEntry[] {
  return [...loadedActivity, ...activityLog].sort((a, b) => a.start - b.start);
}

function getAllSnapshots(): ContentSnapshot[] {
  return [...loadedSnapshots, ...contentSnapshots].sort((a, b) => a.timestamp - b.timestamp);
}

const graphApi = createGraphApi({
  getStore: () => store,
  getCurrentApp: () => currentWindow.app,
  getAllActivity,
  getAllSnapshots,
  getLoadedActivity: () => loadedActivity,
  getActivityLog: () => activityLog,
  getLoadedSnapshots: () => loadedSnapshots,
  getContentSnapshots: () => contentSnapshots,
  getClipboardLog: () => (localSignals ? localSignals.getClipboardLog() : []),
  getNowPlayingLog: () => (localSignals ? localSignals.getNowPlayingLog() : []),
  claudeRequest: claudeApi.claudeRequest,
  nia,
  persistedActivityMax: PERSISTED_ACTIVITY_MAX,
  persistedSnapshotsMax: PERSISTED_SNAPSHOTS_MAX,
});

localSignals = new LocalSignalsMonitor({
  getCurrentApp: () => currentWindow.app,
  addEntity: graphApi.addEntity,
});

function appendKnowledge(facts: string[]): void {
  localKnowledgeCache.appendKnowledge(facts);
}

async function pollActiveWindow(): Promise<void> {
  currentWindow = await pollActiveWindowFromModule({
    currentWindow,
    minDurationMs: MIN_DURATION_MS,
    contentSnapshots,
    activityLog,
    extractEntitiesFromActivity: graphApi.extractEntitiesFromActivity,
  });
}

function updateStatus(status: string): void {
  windows.updateStatus(status);
}

function showScamAlert(data: ScamResult): void {
  windows.showScamAlert(data);
}

function dismissAlert(): void {
  windows.dismissAlert();
}

const monitoringPipeline = createMonitoringPipeline({
  getStore: () => store,
  getCurrentWindow: () => currentWindow,
  updateStatus,
  ocrEngine,
  screenChangeTracker,
  contentSnapshots,
  pendingSummaries,
  previousTexts,
  extractEntitiesFromActivity: graphApi.extractEntitiesFromActivity,
  claudeRequest: claudeApi.claudeRequest,
  analyzeForScam: claudeApi.analyzeForScam,
  showScamAlert,
  dismissAlert,
});

const flushToNia = createFlushToNia({
  getStore: () => store,
  nia,
  getCurrentWindow: () => currentWindow,
  minDurationMs: MIN_DURATION_MS,
  activityLog,
  contentSnapshots,
  pendingSummaries,
  getAllActivity,
  getAllSnapshots,
  extractEntitiesFromActivity: graphApi.extractEntitiesFromActivity,
  claudeRequest: claudeApi.claudeRequest,
  appendKnowledge,
  getLoadedActivity: () => loadedActivity,
  setLoadedActivity: (items) => {
    loadedActivity = items;
  },
  getLoadedSnapshots: () => loadedSnapshots,
  setLoadedSnapshots: (items) => {
    loadedSnapshots = items;
  },
  persistedActivityMax: PERSISTED_ACTIVITY_MAX,
  persistedSnapshotsMax: PERSISTED_SNAPSHOTS_MAX,
});

const assistantApi = createAssistantApi({
  getStore: () => store,
  nia,
  localKnowledgeCache,
  getAllActivity,
  getAllSnapshots,
  getCurrentWindow: () => currentWindow,
  claudeRequest: claudeApi.claudeRequest,
  appendKnowledge,
});

const monitoringControl = createMonitoringControl({
  getStore: () => store,
  pollActiveWindow,
  captureLoop: monitoringPipeline.captureLoop,
  flushToNia,
  detectPatterns: assistantApi.detectPatterns,
  generateSummaries: monitoringPipeline.generateSummaries,
  getAllActivity,
  getAllSnapshots,
  getLocalKnowledge: () => localKnowledgeCache.getKnowledge(),
  getRecentClipboard: () => localSignals.getClipboardLog(),
  getRecentNowPlaying: () => localSignals.getNowPlayingLog(),
  claudeRequest: claudeApi.claudeRequest,
  appendKnowledge,
  localSignalsStart: () => localSignals.start(),
  localSignalsStop: () => localSignals.stop(),
  saveGraphToStore: graphApi.saveGraphToStore,
  aiExtractEntities: graphApi.aiExtractEntities,
  decayGraph: graphApi.decayGraph,
  cleanupGraph: graphApi.cleanupGraph,
  buildNiaEdges: graphApi.buildNiaEdges,
  updateStatus,
});

const insightsApi = createInsightsApi({
  getStore: () => store,
  nia,
  getAllActivity,
  getAllSnapshots,
  getPendingSummariesCount: () => pendingSummaries.length,
  getCurrentApp: () => currentWindow.app,
  localKnowledgeCache,
  getEntityCount: graphApi.getEntityCount,
  getClipboardCount: () => localSignals.getClipboardLog().length,
  getNowPlayingCount: () => localSignals.getNowPlayingLog().length,
  getNodeLabel: graphApi.getNodeLabel,
  getNodeDetailData: graphApi.getNodeDetailData,
  getEdgeDetailData: graphApi.getEdgeDetailData,
  claudeRequest: claudeApi.claudeRequest,
});

function createChatWindow(): void {
  windows.createChatWindow();
}

function createIndicatorWindow(): void {
  windows.createIndicatorWindow();
}

function createOverlayWindow(): void {
  windows.createOverlayWindow();
}

function createSettingsWindow(): void {
  windows.createSettingsWindow();
}

function getSettingsPayload(): Settings {
  return buildSettingsPayload(store);
}

function saveSettingsPayload(settings: Partial<Settings>): boolean {
  return persistSettingsPayload(store, settings, {
    setNiaApiKey: (key: string) => nia.setApiKey(key),
    startMonitoring: monitoringControl.startMonitoring,
    stopMonitoring: monitoringControl.stopMonitoring,
    refreshElephantShortcut: updateElephantShortcut,
  });
}

const ipcRegistration = createIpcRegistration({
  getSettingsPayload,
  saveSettingsPayload,
  getApiKey: () => getStoreApiKey(store),
  handleChatQuery: assistantApi.handleChatQuery,
  getActivityStats: assistantApi.getLocalStats,
  exportMarkdown: assistantApi.exportMarkdown,
  flushNow: flushToNia,
  detectPatternsNow: assistantApi.detectPatterns,
  searchNia: insightsApi.searchNia,
  listNiaContexts: insightsApi.listNiaContexts,
  getSessionStats: insightsApi.getSessionStats,
  getEntityGraph: () => graphApi.getGraphData(),
  getNodeDetail: (nodeId) => graphApi.getNodeDetailData(nodeId),
  getEdgeDetail: (sourceId, targetId) => graphApi.getEdgeDetailData(sourceId, targetId),
  previewGraphGroup: insightsApi.previewGraphGroup,
  getUnderstandingPreview: insightsApi.getUnderstandingPreview,
  analyzeGraphGroup: insightsApi.analyzeGraphGroup,
  getLocalKnowledge: () => localKnowledgeCache.getKnowledge(),
  openSettings: createSettingsWindow,
  openChat: createChatWindow,
  updateStatus,
  showAlert: showScamAlert,
  dismissAlert,
  onOverlayMouseEnter: () => windows.setOverlayInteractive(true),
  onOverlayMouseLeave: () => windows.setOverlayInteractive(false),
  resizeOverlay: (height) => windows.resizeOverlay(height),
});

async function initStore(): Promise<void> {
  store = await initConfigStore();
}

function updateElephantShortcut(): void {
  globalShortcut.unregister('Alt+K');

  if (!isStoreElephantEnabled(store)) return;

  const ok = globalShortcut.register('Alt+K', () => {
    elephant.toggleElephant();
  });

  if (!ok) {
    console.warn('[Enk] Failed to register Elephant shortcut (Alt+K)');
    return;
  }

  console.log('[Enk] Elephant shortcut registered (Alt+K)');
}

let started = false;

function startBootstrap(): void {
  if (started) return;
  started = true;

  graphApi.initGraphService();
  ipcRegistration.registerIpcHandlers();

  app.whenReady().then(async () => {
    await initStore();
    assistantApi.initPatternDetector();

    elephant.init({
      apiKey: () => getStoreApiKey(store),
    });
    elephant.setupIPC();
    updateElephantShortcut();

    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log('[Enk] Screen recording permission:', status);
    }

    createIndicatorWindow();
    createOverlayWindow();

    if (store.get('firstLaunch') === undefined) store.set('firstLaunch', true);

    console.log('[Enk] Initializing Tesseract...');
    try {
      await ocrEngine.init();
    } catch (err) {
      console.error('[Enk] Tesseract init failed:', err);
    }

    graphApi.loadGraphFromStore();

    try {
      const rawActivity = store?.get('persistedActivity');
      loadedActivity = Array.isArray(rawActivity) ? rawActivity : [];

      const rawSnapshots = store?.get('persistedSnapshots');
      loadedSnapshots = Array.isArray(rawSnapshots)
        ? rawSnapshots.map((snapshot: any) => ({ ...snapshot, fullText: snapshot.fullText || snapshot.text || '' }))
        : [];

      if (loadedActivity.length > 0 || loadedSnapshots.length > 0) {
        console.log(
          `[Enk] Loaded ${loadedActivity.length} activity entries, ${loadedSnapshots.length} snapshots from previous sessions`
        );
      }
    } catch (e) {
      console.warn('[Enk] Failed to load persisted activity/snapshots:', (e as Error).message);
    }

    createChatWindow();

    (async () => {
      await assistantApi.initSoulAndUser();
      await localKnowledgeCache.initFromNia();
      if (store.get('enabled')) monitoringControl.startMonitoring();
      console.log('[Enk] Startup complete');
    })().catch((e) => console.error('[Enk] Startup error:', (e as Error).message));
  });

  app.on('activate', () => createChatWindow());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
  app.on('before-quit', async () => {
    graphApi.saveGraphToStore();

    try {
      const combinedActivity = [...loadedActivity, ...activityLog]
        .sort((a, b) => a.start - b.start)
        .slice(-PERSISTED_ACTIVITY_MAX);

      const combinedSnapshots = [...loadedSnapshots, ...contentSnapshots]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-PERSISTED_SNAPSHOTS_MAX);

      store?.set('persistedActivity', combinedActivity);
      store?.set(
        'persistedSnapshots',
        combinedSnapshots.map((snapshot) => ({
          timestamp: snapshot.timestamp,
          app: snapshot.app,
          title: snapshot.title,
          url: snapshot.url,
          text: snapshot.text.slice(0, 400),
          fullText: '',
          summary: snapshot.summary,
        }))
      );
    } catch {
      // ignore persistence failures
    }

    try {
      await flushToNia();
    } catch {
      // best effort
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

export { startBootstrap };
